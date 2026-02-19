#import "BleAdvertisingModule.h"

static NSString *const kServiceUUID  = @"0000FDA0-0000-1000-8000-00805F9B34FB";
static NSString *const kCharUUID     = @"0000FDA1-0000-1000-8000-00805F9B34FB";

@implementation BleAdvertisingModule {
  CBPeripheralManager *_peripheralManager;
  CBMutableCharacteristic *_characteristic;
  NSData *_roomInfoData;
  BOOL _isAdvertisingFlag;
  BOOL _hasListeners;
  RCTPromiseResolveBlock _pendingResolve;
  RCTPromiseRejectBlock _pendingReject;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving  { _hasListeners = NO; }

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"ble_advertising_started",
    @"ble_advertising_stopped",
    @"ble_advertising_error"
  ];
}

- (void)emit:(NSString *)name body:(id)body {
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

- (void)initPeripheralManager {
  if (!_peripheralManager) {
    _peripheralManager = [[CBPeripheralManager alloc] initWithDelegate:self queue:nil];
  }
}

#pragma mark - Public methods

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self initPeripheralManager];
  resolve(@(_peripheralManager.state == CBManagerStatePoweredOn));
}

RCT_EXPORT_METHOD(startAdvertising:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self initPeripheralManager];

  if (_isAdvertisingFlag) {
    [self stopAdvertisingInternal];
  }

  NSMutableDictionary *roomInfo = [NSMutableDictionary new];
  roomInfo[@"roomId"]        = data[@"roomId"] ?: @"";
  roomInfo[@"roomName"]      = data[@"roomName"] ?: @"";
  roomInfo[@"hostId"]        = data[@"hostId"] ?: @"";
  roomInfo[@"hostName"]      = data[@"hostName"] ?: @"";
  roomInfo[@"hostAddress"]   = data[@"hostAddress"] ?: @"";
  roomInfo[@"wifiAvailable"] = data[@"wifiAvailable"] ?: @NO;
  roomInfo[@"wsPort"]        = data[@"wsPort"] ?: @8787;
  if (data[@"hotspotSSID"])     roomInfo[@"hotspotSSID"] = data[@"hotspotSSID"];
  if (data[@"hotspotPassword"]) roomInfo[@"hotspotPassword"] = data[@"hotspotPassword"];

  _roomInfoData = [NSJSONSerialization dataWithJSONObject:roomInfo options:0 error:nil] ?: [NSData data];

  if (_peripheralManager.state == CBManagerStatePoweredOn) {
    [self startAdvertisingInternal];
    resolve(@YES);
  } else {
    _pendingResolve = resolve;
    _pendingReject = reject;
  }
}

RCT_EXPORT_METHOD(stopAdvertising:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self stopAdvertisingInternal];
  resolve(@YES);
}

RCT_EXPORT_METHOD(getAdvertisingState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@(_isAdvertisingFlag));
}

#pragma mark - Internal

- (void)startAdvertisingInternal {
  _characteristic = [[CBMutableCharacteristic alloc]
    initWithType:[CBUUID UUIDWithString:kCharUUID]
      properties:CBCharacteristicPropertyRead
           value:nil
     permissions:CBAttributePermissionsReadable];

  CBMutableService *service = [[CBMutableService alloc]
    initWithType:[CBUUID UUIDWithString:kServiceUUID] primary:YES];
  service.characteristics = @[_characteristic];

  [_peripheralManager removeAllServices];
  [_peripheralManager addService:service];
  [_peripheralManager startAdvertising:@{
    CBAdvertisementDataServiceUUIDsKey: @[[CBUUID UUIDWithString:kServiceUUID]],
    CBAdvertisementDataLocalNameKey: @"Pandemic"
  }];

  _isAdvertisingFlag = YES;
  [self emit:@"ble_advertising_started" body:nil];
}

- (void)stopAdvertisingInternal {
  [_peripheralManager stopAdvertising];
  [_peripheralManager removeAllServices];
  _isAdvertisingFlag = NO;
  [self emit:@"ble_advertising_stopped" body:nil];
}

#pragma mark - CBPeripheralManagerDelegate

- (void)peripheralManagerDidUpdateState:(CBPeripheralManager *)peripheral {
  NSLog(@"[BleAdvertising] State: %ld", (long)peripheral.state);

  if (peripheral.state == CBManagerStatePoweredOn) {
    if (_pendingResolve) {
      [self startAdvertisingInternal];
      _pendingResolve(@YES);
      _pendingResolve = nil;
      _pendingReject = nil;
    }
  } else if (peripheral.state == CBManagerStatePoweredOff ||
             peripheral.state == CBManagerStateUnauthorized) {
    if (_pendingReject) {
      _pendingReject(@"INIT_ERROR", @"Bluetooth not available", nil);
      _pendingResolve = nil;
      _pendingReject = nil;
    }
    if (_isAdvertisingFlag) {
      _isAdvertisingFlag = NO;
      [self emit:@"ble_advertising_error" body:@{@"error": @"Bluetooth turned off"}];
    }
  }
}

- (void)peripheralManager:(CBPeripheralManager *)peripheral
    didReceiveReadRequest:(CBATTRequest *)request {
  if ([request.characteristic.UUID isEqual:[CBUUID UUIDWithString:kCharUUID]]) {
    NSLog(@"[BleAdvertising] Read request received");

    if (request.offset > _roomInfoData.length) {
      [peripheral respondToRequest:request withResult:CBATTErrorInvalidOffset];
      return;
    }

    request.value = [_roomInfoData subdataWithRange:
      NSMakeRange(request.offset, _roomInfoData.length - request.offset)];
    [peripheral respondToRequest:request withResult:CBATTErrorSuccess];
  } else {
    [peripheral respondToRequest:request withResult:CBATTErrorAttributeNotFound];
  }
}

- (void)peripheralManagerDidStartAdvertising:(CBPeripheralManager *)peripheral
                                       error:(NSError *)error {
  if (error) {
    NSLog(@"[BleAdvertising] Failed: %@", error.localizedDescription);
    _isAdvertisingFlag = NO;
    [self emit:@"ble_advertising_error" body:@{@"error": error.localizedDescription}];
  } else {
    NSLog(@"[BleAdvertising] Started successfully");
  }
}

@end
