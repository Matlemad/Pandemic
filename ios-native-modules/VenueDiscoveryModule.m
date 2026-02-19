#import "VenueDiscoveryModule.h"
#import <arpa/inet.h>
#import <netdb.h>

@implementation VenueDiscoveryModule {
  NSNetServiceBrowser *_browser;
  NSNetService *_registeredService;
  NSMutableDictionary<NSString *, NSNetService *> *_discoveredServices;
  NSMutableDictionary<NSString *, NSDictionary *> *_resolvedServices;
  NSMutableArray<NSNetService *> *_resolveQueue;
  BOOL _isResolving;
  BOOL _isDiscoveringFlag;
  BOOL _isAdvertisingFlag;
  BOOL _hasListeners;
  NSString *_currentServiceType;
}

RCT_EXPORT_MODULE();

- (instancetype)init {
  self = [super init];
  if (self) {
    _discoveredServices = [NSMutableDictionary new];
    _resolvedServices = [NSMutableDictionary new];
    _resolveQueue = [NSMutableArray new];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup { return NO; }

- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving  { _hasListeners = NO; }

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"venue_discovery_started", @"venue_discovery_stopped",
    @"venue_service_found", @"venue_service_lost",
    @"venue_discovery_error",
    @"venue_advertise_started", @"venue_advertise_stopped",
    @"venue_advertise_error",
    @"venue_service_discovered", @"venue_resolve_failed",
    @"venue_resolution_status"
  ];
}

- (void)emit:(NSString *)name body:(id)body {
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

#pragma mark - Discovery

RCT_EXPORT_METHOD(startDiscovery:(NSString *)serviceType
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (_isDiscoveringFlag) { resolve(@YES); return; }

  _currentServiceType = [serviceType hasSuffix:@"."]
    ? [serviceType substringToIndex:serviceType.length - 1]
    : serviceType;

  dispatch_async(dispatch_get_main_queue(), ^{
    self->_browser = [[NSNetServiceBrowser alloc] init];
    self->_browser.delegate = self;
    [self->_browser searchForServicesOfType:self->_currentServiceType inDomain:@"local."];
  });

  resolve(@YES);
}

RCT_EXPORT_METHOD(stopDiscovery:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (!_isDiscoveringFlag) { resolve(@YES); return; }

  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_browser stop];
    self->_browser.delegate = nil;
    self->_browser = nil;
    [self->_discoveredServices removeAllObjects];
    [self->_resolvedServices removeAllObjects];
    [self->_resolveQueue removeAllObjects];
    self->_isResolving = NO;
    self->_isDiscoveringFlag = NO;
  });

  resolve(@YES);
}

RCT_EXPORT_METHOD(isDiscovering:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@(_isDiscoveringFlag));
}

RCT_EXPORT_METHOD(getDiscoveredServices:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(_resolvedServices.allValues);
}

#pragma mark - NSNetServiceBrowserDelegate

- (void)netServiceBrowserWillSearch:(NSNetServiceBrowser *)browser {
  _isDiscoveringFlag = YES;
  [self emit:@"venue_discovery_started" body:nil];
}

- (void)netServiceBrowser:(NSNetServiceBrowser *)browser
             didNotSearch:(NSDictionary<NSString *,NSNumber *> *)errorDict {
  _isDiscoveringFlag = NO;
  [self emit:@"venue_discovery_error" body:@{
    @"code": @"DISCOVERY_FAILED",
    @"message": [NSString stringWithFormat:@"Failed: %@", errorDict]
  }];
}

- (void)netServiceBrowser:(NSNetServiceBrowser *)browser
           didFindService:(NSNetService *)service
               moreComing:(BOOL)moreComing {
  NSLog(@"[VenueDiscovery] Found: %@", service.name);
  _discoveredServices[service.name] = service;

  [self emit:@"venue_service_discovered" body:@{
    @"name": service.name,
    @"type": service.type
  }];

  [self enqueueResolve:service];
}

- (void)netServiceBrowser:(NSNetServiceBrowser *)browser
         didRemoveService:(NSNetService *)service
               moreComing:(BOOL)moreComing {
  NSLog(@"[VenueDiscovery] Lost: %@", service.name);
  [_discoveredServices removeObjectForKey:service.name];

  NSDictionary *resolved = _resolvedServices[service.name];
  if (resolved) {
    [_resolvedServices removeObjectForKey:service.name];
    [self emit:@"venue_service_lost" body:resolved];
  }

  [_resolveQueue filterUsingPredicate:
    [NSPredicate predicateWithFormat:@"name != %@", service.name]];
}

- (void)netServiceBrowserDidStopSearch:(NSNetServiceBrowser *)browser {
  _isDiscoveringFlag = NO;
  [self emit:@"venue_discovery_stopped" body:nil];
}

#pragma mark - Resolution queue

- (void)enqueueResolve:(NSNetService *)service {
  if (_resolvedServices[service.name]) return;
  for (NSNetService *s in _resolveQueue) {
    if ([s.name isEqualToString:service.name]) return;
  }
  [_resolveQueue addObject:service];
  [self processResolveQueue];
}

- (void)processResolveQueue {
  if (_isResolving || _resolveQueue.count == 0) return;
  NSNetService *service = _resolveQueue.firstObject;
  [_resolveQueue removeObjectAtIndex:0];
  _isResolving = YES;

  [self emit:@"venue_resolution_status" body:@{
    @"status": @"resolving",
    @"name": service.name,
    @"queueSize": @(_resolveQueue.count)
  }];

  dispatch_async(dispatch_get_main_queue(), ^{
    service.delegate = self;
    [service resolveWithTimeout:5.0];
  });
}

#pragma mark - NSNetServiceDelegate (resolution)

- (void)netServiceDidResolveAddress:(NSNetService *)service {
  _isResolving = NO;
  NSLog(@"[VenueDiscovery] Resolved: %@ port %ld", service.name, (long)service.port);

  // Extract IPv4 address
  NSString *host = nil;
  for (NSData *addrData in service.addresses) {
    const struct sockaddr *addr = (const struct sockaddr *)addrData.bytes;
    if (addr->sa_family == AF_INET) {
      char hostBuf[NI_MAXHOST];
      if (getnameinfo(addr, (socklen_t)addrData.length,
                       hostBuf, sizeof(hostBuf), NULL, 0, NI_NUMERICHOST) == 0) {
        host = [NSString stringWithUTF8String:hostBuf];
        break;
      }
    }
  }

  // Fallback to hostName
  if (!host && service.hostName) {
    host = [service.hostName hasSuffix:@"."]
      ? [service.hostName substringToIndex:service.hostName.length - 1]
      : service.hostName;
  }

  if (!host) { [self processResolveQueue]; return; }

  // Parse TXT record
  NSMutableDictionary *txt = [NSMutableDictionary new];
  NSData *txtData = service.TXTRecordData;
  if (txtData) {
    NSDictionary<NSString *, NSData *> *dict = [NSNetService dictionaryFromTXTRecordData:txtData];
    for (NSString *key in dict) {
      txt[key] = [[NSString alloc] initWithData:dict[key] encoding:NSUTF8StringEncoding] ?: @"";
    }
  }

  NSDictionary *body = @{
    @"name": service.name,
    @"host": host,
    @"port": @(service.port),
    @"txt": txt,
    @"fullName": [NSString stringWithFormat:@"%@.%@", service.name, service.type]
  };

  _resolvedServices[service.name] = body;
  [self emit:@"venue_service_found" body:body];
  [self processResolveQueue];
}

- (void)netService:(NSNetService *)service
     didNotResolve:(NSDictionary<NSString *,NSNumber *> *)errorDict {
  NSLog(@"[VenueDiscovery] Resolve failed: %@ %@", service.name, errorDict);
  _isResolving = NO;

  [self emit:@"venue_resolve_failed" body:@{
    @"name": service.name,
    @"errorCode": errorDict[NSNetServicesErrorCode] ?: @(-1)
  }];

  [self processResolveQueue];
}

#pragma mark - Advertisement

RCT_EXPORT_METHOD(startAdvertise:(NSString *)serviceType
                  name:(NSString *)name
                  port:(nonnull NSNumber *)port
                  txt:(NSDictionary *)txt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (_isAdvertisingFlag) { resolve(@YES); return; }

  NSString *cleanType = [serviceType hasSuffix:@"."]
    ? [serviceType substringToIndex:serviceType.length - 1]
    : serviceType;

  dispatch_async(dispatch_get_main_queue(), ^{
    self->_registeredService = [[NSNetService alloc] initWithDomain:@"local."
                                                              type:cleanType
                                                              name:name
                                                              port:[port intValue]];
    self->_registeredService.delegate = self;

    NSMutableDictionary<NSString *, NSData *> *txtDict = [NSMutableDictionary new];
    for (NSString *key in txt) {
      NSString *val = [txt[key] isKindOfClass:[NSString class]] ? txt[key] : [txt[key] description];
      txtDict[key] = [val dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
    }
    [self->_registeredService setTXTRecordData:[NSNetService dataFromTXTRecordDictionary:txtDict]];
    [self->_registeredService publish];
    self->_isAdvertisingFlag = YES;

    [self emit:@"venue_advertise_started" body:@{@"name": name, @"port": port}];
  });

  resolve(@YES);
}

RCT_EXPORT_METHOD(stopAdvertise:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (!_isAdvertisingFlag) { resolve(@YES); return; }

  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_registeredService stop];
    self->_registeredService.delegate = nil;
    self->_registeredService = nil;
    self->_isAdvertisingFlag = NO;
    [self emit:@"venue_advertise_stopped" body:nil];
  });

  resolve(@YES);
}

RCT_EXPORT_METHOD(isAdvertising:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@(_isAdvertisingFlag));
}

- (void)netServiceDidPublish:(NSNetService *)service {
  NSLog(@"[VenueDiscovery] Published: %@", service.name);
}

- (void)netService:(NSNetService *)service
     didNotPublish:(NSDictionary<NSString *,NSNumber *> *)errorDict {
  NSLog(@"[VenueDiscovery] Publish failed: %@", errorDict);
  _isAdvertisingFlag = NO;
  [self emit:@"venue_advertise_error" body:@{
    @"code": @"REGISTER_FAILED",
    @"message": [NSString stringWithFormat:@"Publish failed: %@", errorDict]
  }];
}

@end
