#import "LanHostModule.h"
#import <ifaddrs.h>
#import <arpa/inet.h>
#import <netdb.h>
#import <net/if.h>

@implementation LanHostModule {
  nw_listener_t _listener;
  NSMutableDictionary<NSString *, nw_connection_t> *_connections;
  dispatch_queue_t _queue;
  BOOL _isRunning;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE();

- (instancetype)init {
  self = [super init];
  if (self) {
    _connections = [NSMutableDictionary new];
    _queue = dispatch_queue_create("com.pandemic.lanhost", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup { return NO; }

- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving  { _hasListeners = NO; }

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"lan_host_started", @"lan_host_stopped",
    @"lan_host_client_connected", @"lan_host_client_disconnected",
    @"lan_host_client_message", @"lan_host_client_binary_message",
    @"lan_host_error"
  ];
}

- (void)emit:(NSString *)name body:(id)body {
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

#pragma mark - Server lifecycle

RCT_EXPORT_METHOD(startServer:(nonnull NSNumber *)port
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (_isRunning) { resolve(@YES); return; }

  uint16_t portVal = [port unsignedShortValue];
  __block BOOL resolved = NO;

  nw_parameters_configure_protocol_block_t configureTCP = NW_PARAMETERS_DEFAULT_CONFIGURATION;
  nw_parameters_t params = nw_parameters_create_secure_tcp(
    NW_PARAMETERS_DISABLE_PROTOCOL, configureTCP);

  nw_protocol_options_t wsOpts = nw_ws_create_options(nw_ws_version_13);
  nw_ws_options_set_auto_reply_ping(wsOpts, true);
  nw_protocol_stack_t stack = nw_parameters_copy_default_protocol_stack(params);
  nw_protocol_stack_prepend_application_protocol(stack, wsOpts);

  char portStr[8];
  snprintf(portStr, sizeof(portStr), "%u", portVal);

  _listener = nw_listener_create_with_port(portStr, params);
  if (!_listener) {
    reject(@"START_FAILED", @"Failed to create listener", nil);
    return;
  }

  __weak typeof(self) weakSelf = self;

  nw_listener_set_state_changed_handler(_listener, ^(nw_listener_state_t state, nw_error_t error) {
    typeof(self) self = weakSelf;
    if (!self) return;

    if (state == nw_listener_state_ready) {
      self->_isRunning = YES;
      if (!resolved) {
        resolved = YES;
        [self emit:@"lan_host_started" body:@{@"port": port}];
        resolve(@YES);
      }
    } else if (state == nw_listener_state_failed) {
      self->_isRunning = NO;
      if (!resolved) {
        resolved = YES;
        reject(@"START_FAILED", @"Listener failed to start", nil);
      }
      [self emit:@"lan_host_error" body:@{@"message": @"Listener failed"}];
    } else if (state == nw_listener_state_cancelled) {
      self->_isRunning = NO;
    }
  });

  nw_listener_set_new_connection_handler(_listener, ^(nw_connection_t conn) {
    [weakSelf handleNewConnection:conn];
  });

  nw_listener_set_queue(_listener, _queue);
  nw_listener_start(_listener);
}

RCT_EXPORT_METHOD(stopServer:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  _isRunning = NO;

  @synchronized (_connections) {
    for (NSString *cid in _connections.allKeys) {
      nw_connection_t conn = _connections[cid];
      nw_connection_cancel(conn);
    }
    [_connections removeAllObjects];
  }

  if (_listener) {
    nw_listener_cancel(_listener);
    _listener = nil;
  }

  [self emit:@"lan_host_stopped" body:nil];
  resolve(@YES);
}

#pragma mark - Send

RCT_EXPORT_METHOD(sendToClient:(NSString *)clientId
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  nw_connection_t conn;
  @synchronized (_connections) { conn = _connections[clientId]; }
  if (!conn) { reject(@"CLIENT_NOT_FOUND", @"Client not found", nil); return; }

  NSData *data = [message dataUsingEncoding:NSUTF8StringEncoding];
  [self sendData:data opcode:nw_ws_opcode_text connection:conn completion:^(NSError *err) {
    err ? reject(@"SEND_FAILED", err.localizedDescription, err) : resolve(@YES);
  }];
}

RCT_EXPORT_METHOD(sendBinaryToClient:(NSString *)clientId
                  base64Data:(NSString *)base64Data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  nw_connection_t conn;
  @synchronized (_connections) { conn = _connections[clientId]; }
  if (!conn) { reject(@"CLIENT_NOT_FOUND", @"Client not found", nil); return; }

  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64Data options:0];
  if (!data) { reject(@"SEND_FAILED", @"Invalid base64", nil); return; }

  [self sendData:data opcode:nw_ws_opcode_binary connection:conn completion:^(NSError *err) {
    err ? reject(@"SEND_FAILED", err.localizedDescription, err) : resolve(@YES);
  }];
}

RCT_EXPORT_METHOD(broadcastMessage:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSData *data = [message dataUsingEncoding:NSUTF8StringEncoding];
  NSArray<nw_connection_t> *allConns;
  @synchronized (_connections) { allConns = _connections.allValues; }

  dispatch_group_t group = dispatch_group_create();
  for (nw_connection_t conn in allConns) {
    dispatch_group_enter(group);
    [self sendData:data opcode:nw_ws_opcode_text connection:conn completion:^(NSError *err) {
      dispatch_group_leave(group);
    }];
  }
  dispatch_group_notify(group, dispatch_get_main_queue(), ^{
    resolve(@YES);
  });
}

#pragma mark - Queries

RCT_EXPORT_METHOD(getLocalIPs:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSMutableArray *result = [NSMutableArray new];
  struct ifaddrs *ifaddr;
  if (getifaddrs(&ifaddr) != 0) { resolve(result); return; }

  for (struct ifaddrs *ifa = ifaddr; ifa != NULL; ifa = ifa->ifa_next) {
    if (!ifa->ifa_addr) continue;
    sa_family_t family = ifa->ifa_addr->sa_family;
    NSString *name = [NSString stringWithUTF8String:ifa->ifa_name];
    if ((family == AF_INET || family == AF_INET6) && ![name isEqualToString:@"lo0"]) {
      char host[NI_MAXHOST];
      if (getnameinfo(ifa->ifa_addr, ifa->ifa_addr->sa_len, host, sizeof(host),
                       NULL, 0, NI_NUMERICHOST) == 0) {
        [result addObject:@{
          @"interface": name,
          @"ip": [NSString stringWithUTF8String:host],
          @"isIPv6": @(family == AF_INET6)
        }];
      }
    }
  }
  freeifaddrs(ifaddr);
  resolve(result);
}

RCT_EXPORT_METHOD(getConnectedClients:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  @synchronized (_connections) {
    resolve(_connections.allKeys);
  }
}

RCT_EXPORT_METHOD(isServerRunning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@(_isRunning));
}

#pragma mark - Private helpers

- (void)sendData:(NSData *)data
          opcode:(nw_ws_opcode_t)opcode
      connection:(nw_connection_t)conn
      completion:(void (^)(NSError *))completion {
  nw_protocol_metadata_t meta = nw_ws_create_metadata(opcode);
  nw_content_context_t ctx = nw_content_context_create("msg");
  nw_content_context_set_metadata_for_protocol(ctx, meta);

  dispatch_data_t ddata = dispatch_data_create(data.bytes, data.length,
    _queue, DISPATCH_DATA_DESTRUCTOR_DEFAULT);

  nw_connection_send(conn, ddata, ctx, true, ^(nw_error_t error) {
    if (error && completion) {
      completion([NSError errorWithDomain:@"LanHost" code:-1
        userInfo:@{NSLocalizedDescriptionKey: @"Send failed"}]);
    } else if (completion) {
      completion(nil);
    }
  });
}

- (void)handleNewConnection:(nw_connection_t)conn {
  NSString *clientId = [[NSUUID UUID] UUIDString];
  @synchronized (_connections) { _connections[clientId] = conn; }

  __weak typeof(self) weakSelf = self;

  nw_connection_set_state_changed_handler(conn, ^(nw_connection_state_t state, nw_error_t error) {
    typeof(self) self = weakSelf;
    if (!self) return;

    if (state == nw_connection_state_ready) {
      NSLog(@"[LanHostModule] Client connected: %@", clientId);
      [self emit:@"lan_host_client_connected" body:@{@"clientId": clientId}];
      [self receiveLoop:conn clientId:clientId];
    } else if (state == nw_connection_state_failed ||
               state == nw_connection_state_cancelled) {
      [self handleDisconnection:clientId];
    }
  });

  nw_connection_set_queue(conn, _queue);
  nw_connection_start(conn);
}

- (void)receiveLoop:(nw_connection_t)conn clientId:(NSString *)clientId {
  __weak typeof(self) weakSelf = self;

  nw_connection_receive_message(conn, ^(dispatch_data_t content,
    nw_content_context_t context, bool is_complete, nw_error_t error) {
    typeof(self) self = weakSelf;
    if (!self) return;

    if (error || !content) {
      [self handleDisconnection:clientId];
      return;
    }

    nw_protocol_metadata_t wsMeta =
      nw_content_context_copy_protocol_metadata(context, nw_protocol_copy_ws_definition());

    if (wsMeta) {
      nw_ws_opcode_t opcode = nw_ws_metadata_get_opcode(wsMeta);

      // Convert dispatch_data_t to NSData
      const void *buffer = NULL;
      size_t size = 0;
      dispatch_data_t mapped = dispatch_data_create_map(content, &buffer, &size);
      NSData *nsdata = [NSData dataWithBytes:buffer length:size];
      (void)mapped; // prevent premature dealloc

      if (opcode == nw_ws_opcode_text) {
        NSString *text = [[NSString alloc] initWithData:nsdata encoding:NSUTF8StringEncoding];
        [self emit:@"lan_host_client_message" body:@{
          @"clientId": clientId,
          @"message": text ?: @"",
          @"isBinary": @NO
        }];
      } else if (opcode == nw_ws_opcode_binary) {
        NSString *b64 = [nsdata base64EncodedStringWithOptions:0];
        [self emit:@"lan_host_client_message" body:@{
          @"clientId": clientId,
          @"message": b64 ?: @"",
          @"isBinary": @YES
        }];
      } else if (opcode == nw_ws_opcode_close) {
        [self handleDisconnection:clientId];
        return;
      }
    }

    if (self->_isRunning) {
      [self receiveLoop:conn clientId:clientId];
    }
  });
}

- (void)handleDisconnection:(NSString *)clientId {
  nw_connection_t conn;
  @synchronized (_connections) {
    conn = _connections[clientId];
    [_connections removeObjectForKey:clientId];
  }
  if (!conn) return;

  nw_connection_cancel(conn);
  [self emit:@"lan_host_client_disconnected" body:@{@"clientId": clientId}];
  NSLog(@"[LanHostModule] Client disconnected: %@", clientId);
}

@end
