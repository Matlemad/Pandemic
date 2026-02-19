#import <React/RCTEventEmitter.h>
#import <CoreBluetooth/CoreBluetooth.h>

@interface BleAdvertisingModule : RCTEventEmitter <CBPeripheralManagerDelegate>
@end
