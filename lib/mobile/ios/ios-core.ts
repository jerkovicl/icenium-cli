///<reference path="./../../.d.ts"/>
"use strict";

import path = require("path");
import ref = require("ref");
import ffi = require("ffi");
import struct = require("ref-struct");
import bufferpack = require("bufferpack");
import plistlib = require("plistlib");
import helpers = require("./../../helpers");
import net = require("net");

export class CoreTypes {
	public static pointerSize = ref.types.size_t.size;
	public static voidPtr = ref.refType(ref.types.void);
	public static intPtr = ref.refType(ref.types.int);
	public static uintPtr = ref.refType(ref.types.uint);
	public static charPtr = ref.refType(ref.types.char);
	public static ptrToVoidPtr = ref.refType(ref.refType(ref.types.void));
	public static uintType = ref.types.uint;
	public static uint32Type = ref.types.uint32;
	public static intType = ref.types.int;
	public static boolType = ref.types.bool;
	public static doubleType = ref.types.double;

	public static am_device_p = CoreTypes.voidPtr;
	public static cfDictionaryRef = CoreTypes.voidPtr;
	public static cfDataRef = CoreTypes.voidPtr;
	public static cfStringRef = CoreTypes.voidPtr;
	public static afcConnectionRef = CoreTypes.voidPtr;
	public static afcFileRef = ref.types.uint64;
	public static afcDirectoryRef = CoreTypes.voidPtr;
	public static afcError = ref.types.uint32;
	public static amDeviceRef = CoreTypes.voidPtr;
	public static amDeviceNotificationRef = CoreTypes.voidPtr;
	public static cfTimeInterval = ref.types.double;

	public static am_device_notification = struct({
		unknown0: ref.types.uint32,
		unknown1: ref.types.uint32,
		unknown2: ref.types.uint32,
		callback: CoreTypes.voidPtr,
		cookie: ref.types.uint32
	});

	public static am_device_notification_callback_info = struct({
		dev: CoreTypes.am_device_p,
		msg: ref.types.uint,
		subscription: ref.refType(CoreTypes.am_device_notification)
	});

	public static am_device_notification_callback = ffi.Function("void", [ref.refType(CoreTypes.am_device_notification_callback_info), CoreTypes.voidPtr]);
	public static am_device_install_application_callback = ffi.Function("void", [CoreTypes.cfDictionaryRef, CoreTypes.voidPtr]);
	public static cf_run_loop_timer_callback = ffi.Function("void", [CoreTypes.voidPtr, CoreTypes.voidPtr]);
}

class IOSCore implements Mobile.IiOSCore {
	private static NOT_INSTALLED_iTUNES_ERROR_MESSAGE = "iTunes is not installed";
	private static BITNESS_MISMATCH = "iTunes should be the same bitness as Node";

	constructor(private $logger: ILogger,
		private $fs: IFileSystem,
		private $errors: IErrors) { }

	private cfDictionaryKeyCallBacks = struct({
		version: CoreTypes.uintType,
		retain: CoreTypes.voidPtr,
		release: CoreTypes.voidPtr,
		copyDescription: CoreTypes.voidPtr,
		equal: CoreTypes.voidPtr,
		hash: CoreTypes.voidPtr
	});

	private cfDictionaryValueCallBacks = struct({
		version: CoreTypes.uintType,
		retain: CoreTypes.voidPtr,
		release: CoreTypes.voidPtr,
		copyDescription: CoreTypes.voidPtr,
		equal: CoreTypes.voidPtr
	});

	public static kCFStringEncodingUTF8 = 0x08000100;

	private get CoreFoundationDir(): string {
		if(helpers.isWindows()) {
			return path.join(this.CommonProgramFilesPath, "Apple", "Apple Application Support");
		} else if(helpers.isDarwin()) {
			return "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
		}

		return null;
	}

	private get MobileDeviceDir(): string {
		if(helpers.isWindows()) {
			return path.join(this.CommonProgramFilesPath, "Apple", "Mobile Device Support");
		} else if(helpers.isDarwin()) {
			return "/System/Library/PrivateFrameworks/MobileDevice.framework/MobileDevice";
		}

		return null;
	}

	private get CommonProgramFilesPath(): string {
		return helpers.isWindows64() ? (this.is32BitProcess() ? process.env["CommonProgramFiles(x86)"] : process.env.CommonProgramW6432) :
			process.env.CommonProgramFiles;
	}

	private is32BitProcess(): boolean {
		return ref.types.size_t.size === 4;
	}

	private getForeignPointer(lib: ffi.DynamicLibrary, name: string, type: ref.Type): NodeBuffer {
		var pointer = lib.get(name);
		pointer.type = ref.refType(type);
		return pointer;
	}

	public getCoreFoundationLibrary(): {[key: string]: any} {
		this.validate();

		if(helpers.isWindows()) {
			process.env.PATH = this.CoreFoundationDir + ";" + process.env.PATH;
			process.env.PATH += ";" + this.MobileDeviceDir;
		}

		var coreFoundationDll = helpers.isWindows() ?  path.join(this.CoreFoundationDir, "CoreFoundation.dll") : this.CoreFoundationDir;
		var lib = ffi.DynamicLibrary(coreFoundationDll);

		return {
			"CFRunLoopRun": ffi.ForeignFunction(lib.get("CFRunLoopRun"), "void", []),
			"CFRunLoopStop": ffi.ForeignFunction(lib.get("CFRunLoopStop"), "void", [CoreTypes.voidPtr]),
			"CFRunLoopGetCurrent": ffi.ForeignFunction(lib.get("CFRunLoopGetCurrent"), CoreTypes.voidPtr, []),
			"CFStringCreateWithCString": ffi.ForeignFunction(lib.get("CFStringCreateWithCString"), CoreTypes.cfStringRef, [CoreTypes.voidPtr, "string", "uint"]),
			"CFDictionaryGetValue": ffi.ForeignFunction(lib.get("CFDictionaryGetValue"), CoreTypes.voidPtr, [CoreTypes.cfDictionaryRef, CoreTypes.cfStringRef]),
			"CFNumberGetValue": ffi.ForeignFunction(lib.get("CFNumberGetValue"), CoreTypes.boolType, [CoreTypes.voidPtr, "uint", CoreTypes.voidPtr]),
			"CFStringGetCStringPtr": ffi.ForeignFunction(lib.get("CFStringGetCStringPtr"), CoreTypes.charPtr, [CoreTypes.cfStringRef, "uint"]),
			"CFStringGetCString": ffi.ForeignFunction(lib.get("CFStringGetCString"), CoreTypes.boolType, [CoreTypes.cfStringRef, CoreTypes.charPtr, "uint", "uint"]),
			"CFStringGetLength":  ffi.ForeignFunction(lib.get("CFStringGetLength"), "ulong", [CoreTypes.cfStringRef]),
			"CFDictionaryGetCount": ffi.ForeignFunction(lib.get("CFDictionaryGetCount"), "int", [CoreTypes.cfDictionaryRef]),
			"CFDictionaryGetKeysAndValues": ffi.ForeignFunction(lib.get("CFDictionaryGetKeysAndValues"), "void", [CoreTypes.cfDictionaryRef, CoreTypes.ptrToVoidPtr, CoreTypes.ptrToVoidPtr]),
			"CFDictionaryCreate": ffi.ForeignFunction(lib.get("CFDictionaryCreate"), CoreTypes.cfDictionaryRef, [CoreTypes.voidPtr, CoreTypes.ptrToVoidPtr, CoreTypes.ptrToVoidPtr, "int", ref.refType(this.cfDictionaryKeyCallBacks), ref.refType(this.cfDictionaryValueCallBacks)]),
			"kCFTypeDictionaryKeyCallBacks": lib.get("kCFTypeDictionaryKeyCallBacks"),
			"kCFTypeDictionaryValueCallBacks": lib.get("kCFTypeDictionaryValueCallBacks"),
			"CFRunLoopRunInMode": ffi.ForeignFunction(lib.get("CFRunLoopRunInMode"),CoreTypes.intType, [CoreTypes.cfStringRef, CoreTypes.cfTimeInterval, CoreTypes.boolType]),
			"kCFRunLoopDefaultMode": this.getForeignPointer(lib, "kCFRunLoopDefaultMode", ref.types.void),
			"kCFRunLoopCommonModes": this.getForeignPointer(lib, "kCFRunLoopCommonModes", ref.types.void),
			"CFRunLoopTimerCreate": ffi.ForeignFunction(lib.get("CFRunLoopTimerCreate"), CoreTypes.voidPtr, [CoreTypes.voidPtr, CoreTypes.doubleType, CoreTypes.doubleType, CoreTypes.uintType, CoreTypes.uintType, CoreTypes.cf_run_loop_timer_callback, CoreTypes.voidPtr]),
			"CFRunLoopAddTimer": ffi.ForeignFunction(lib.get("CFRunLoopAddTimer"), "void", [CoreTypes.voidPtr, CoreTypes.voidPtr, CoreTypes.cfStringRef]),
			"CFRunLoopRemoveTimer": ffi.ForeignFunction(lib.get("CFRunLoopRemoveTimer"), "void", [CoreTypes.voidPtr, CoreTypes.voidPtr, CoreTypes.cfStringRef]),
			"CFAbsoluteTimeGetCurrent": ffi.ForeignFunction(lib.get("CFAbsoluteTimeGetCurrent"), CoreTypes.doubleType, [])
		};
	}

	public getMobileDeviceLibrary(): {[key: string]: any} {
		var mobileDeviceDll = helpers.isWindows() ? path.join(this.MobileDeviceDir, "MobileDevice.dll") : this.MobileDeviceDir;
		var lib = ffi.DynamicLibrary(mobileDeviceDll);

		return  {
			"AMDeviceNotificationSubscribe": ffi.ForeignFunction(lib.get("AMDeviceNotificationSubscribe"), "uint", [CoreTypes.am_device_notification_callback, "uint", "uint", "uint", CoreTypes.ptrToVoidPtr]),
			"AMDeviceConnect": ffi.ForeignFunction(lib.get("AMDeviceConnect"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceIsPaired": ffi.ForeignFunction(lib.get("AMDeviceIsPaired"), "uint", [CoreTypes.am_device_p]),
			"AMDevicePair": ffi.ForeignFunction(lib.get("AMDevicePair"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceValidatePairing": ffi.ForeignFunction(lib.get("AMDeviceValidatePairing"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceStartSession": ffi.ForeignFunction(lib.get("AMDeviceStartSession"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceStopSession": ffi.ForeignFunction(lib.get("AMDeviceStopSession"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceDisconnect": ffi.ForeignFunction(lib.get("AMDeviceDisconnect"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceStartService": ffi.ForeignFunction(lib.get("AMDeviceStartService"), "uint", [CoreTypes.am_device_p, CoreTypes.cfStringRef, CoreTypes.intPtr, CoreTypes.voidPtr]),
			"AMDeviceTransferApplication": ffi.ForeignFunction(lib.get("AMDeviceTransferApplication"), "uint", ["int", CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_install_application_callback, CoreTypes.voidPtr]),
			"AMDeviceInstallApplication": ffi.ForeignFunction(lib.get("AMDeviceInstallApplication"), "uint", ["int", CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_install_application_callback, CoreTypes.voidPtr]),
			"AMDeviceLookupApplications": ffi.ForeignFunction(lib.get("AMDeviceLookupApplications"), "uint", [CoreTypes.am_device_p, "uint", ref.refType(CoreTypes.cfDictionaryRef)]),
			"AMDeviceUninstallApplication": ffi.ForeignFunction(lib.get("AMDeviceUninstallApplication"), "uint", ["int", CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_install_application_callback, CoreTypes.voidPtr]),
			"AFCConnectionOpen": ffi.ForeignFunction(lib.get("AFCConnectionOpen"), "uint", ["int", "uint", ref.refType(CoreTypes.afcConnectionRef)]),
			"AFCConnectionClose": ffi.ForeignFunction(lib.get("AFCConnectionClose"), "uint", [CoreTypes.afcConnectionRef]),
			"AFCDirectoryCreate": ffi.ForeignFunction(lib.get("AFCDirectoryCreate"), "uint", [CoreTypes.afcConnectionRef, "string"]),
			"AFCFileRefOpen": ffi.ForeignFunction(lib.get("AFCFileRefOpen"), "uint", [CoreTypes.afcConnectionRef, "string", "uint", "uint", ref.refType(CoreTypes.afcFileRef)]),
			"AFCFileRefClose": ffi.ForeignFunction(lib.get("AFCFileRefClose"), "uint", [CoreTypes.afcConnectionRef, CoreTypes.afcFileRef]),
			"AFCFileRefWrite": ffi.ForeignFunction(lib.get("AFCFileRefWrite"), "uint", [CoreTypes.afcConnectionRef, CoreTypes.afcFileRef, CoreTypes.voidPtr, "uint"]),
			"AFCFileRefRead": ffi.ForeignFunction(lib.get("AFCFileRefRead"), "uint", [CoreTypes.afcConnectionRef, CoreTypes.afcFileRef, CoreTypes.voidPtr, CoreTypes.uintPtr]),
			"AFCDirectoryOpen": ffi.ForeignFunction(lib.get("AFCDirectoryOpen"), CoreTypes.afcError, [CoreTypes.afcConnectionRef, "string", ref.refType(CoreTypes.afcDirectoryRef)]),
			"AFCDirectoryRead": ffi.ForeignFunction(lib.get("AFCDirectoryRead"), CoreTypes.afcError, [CoreTypes.afcConnectionRef, CoreTypes.afcDirectoryRef, ref.refType(CoreTypes.charPtr)]),
			"AFCDirectoryClose": ffi.ForeignFunction(lib.get("AFCDirectoryClose"), CoreTypes.afcError, [CoreTypes.afcConnectionRef, CoreTypes.afcDirectoryRef]),
			"AMDeviceCopyDeviceIdentifier": ffi.ForeignFunction(lib.get("AMDeviceCopyDeviceIdentifier"), CoreTypes.cfStringRef, [CoreTypes.am_device_p]),
			"AMDeviceCopyValue": ffi.ForeignFunction(lib.get("AMDeviceCopyValue"), CoreTypes.cfStringRef, [CoreTypes.am_device_p, CoreTypes.cfStringRef, CoreTypes.cfStringRef]),
			"AMDeviceNotificationUnsubscribe": ffi.ForeignFunction(lib.get("AMDeviceNotificationUnsubscribe"), CoreTypes.intType, [CoreTypes.amDeviceNotificationRef])
		};
	}

	public static getWinSocketLibrary(): {[key: string]: any} {
		var winSocketDll = path.join(process.env.SystemRoot, "System32", "ws2_32.dll");

		return ffi.Library(winSocketDll, {
			"closesocket": ["int", ["uint"]],
			"recv": ["int", ["uint", CoreTypes.charPtr, "int", "int"]],
			"send": ["int", ["uint", "string", "int", "int"]],
			"setsockopt": ["int", ["uint", "int", "int", CoreTypes.voidPtr, "int"]]
		});
	}

	private validate(): void {
		if(helpers.isWindows64()) {
			var existsAppleFolder32 = this.$fs.exists(path.join(process.env["CommonProgramFiles(x86)"], "Apple")).wait();
			var existsAppleFolder64 = this.$fs.exists(path.join(process.env.CommonProgramW6432, "Apple")).wait();

			if(!existsAppleFolder32 && !existsAppleFolder64) {
				this.$errors.fail(IOSCore.NOT_INSTALLED_iTUNES_ERROR_MESSAGE);
			}

			if((this.is32BitProcess() && !existsAppleFolder32 && existsAppleFolder64) ||
				!this.is32BitProcess() && !existsAppleFolder64 && existsAppleFolder32) {
				this.$errors.fail(IOSCore.BITNESS_MISMATCH);
			}

		} else if(helpers.isWindows32()) {
			if(!this.$fs.exists(path.join(process.env.CommonProgramFiles)).wait()) {
				this.$errors.fail(IOSCore.NOT_INSTALLED_iTUNES_ERROR_MESSAGE);
			}
		} else if(helpers.isDarwin()) {
			var existsCoreFoundation = this.$fs.exists(this.CoreFoundationDir).wait();
			var existsMobileDevice = this.$fs.exists(this.MobileDeviceDir).wait();

			if(!existsCoreFoundation || !existsMobileDevice) {
				this.$errors.fail(IOSCore.NOT_INSTALLED_iTUNES_ERROR_MESSAGE);
			}
		} else {
			this.$errors.fail("Unsupported platform");
		}
	}
}
$injector.register("iOSCore", IOSCore);

export class CoreFoundation implements  Mobile.ICoreFoundation {
	private coreFoundationLibrary: any;

	constructor($iOSCore: Mobile.IiOSCore) {
		this.coreFoundationLibrary = $iOSCore.getCoreFoundationLibrary();
	}

	public runLoopRun(): void {
		this.coreFoundationLibrary.CFRunLoopRun();
	}

	public runLoopGetCurrent(): any {
		return this.coreFoundationLibrary.CFRunLoopGetCurrent();
	}

	public kCFRunLoopCommonModes(): NodeBuffer {
		return this.coreFoundationLibrary.kCFRunLoopCommonModes.deref();
	}

	public kCFRunLoopDefaultMode(): NodeBuffer {
		return this.coreFoundationLibrary.kCFRunLoopDefaultMode.deref();
	}

	public kCFTypeDictionaryValueCallBacks(): NodeBuffer {
		return this.coreFoundationLibrary.kCFTypeDictionaryValueCallBacks;
	}

	public kCFTypeDictionaryKeyCallBacks(): NodeBuffer {
		return this.coreFoundationLibrary.kCFTypeDictionaryKeyCallBacks;
	}

	public runLoopTimerCreate(allocator: NodeBuffer, fireDate: number, interval: number, flags: number, order: number, callout: NodeBuffer, context: any): NodeBuffer {
		return this.coreFoundationLibrary.CFRunLoopTimerCreate(allocator, fireDate, interval, flags, order, callout, context);
	}

	public absoluteTimeGetCurrent(): number {
		return this.coreFoundationLibrary.CFAbsoluteTimeGetCurrent();
	}

	public runLoopAddTimer(r1: NodeBuffer, timer: NodeBuffer, mode: NodeBuffer): void {
		this.coreFoundationLibrary.CFRunLoopAddTimer(r1, timer, mode);
	}

	public runLoopRemoveTimer(r1: NodeBuffer, timer: NodeBuffer, mode: NodeBuffer): void {
		this.coreFoundationLibrary.CFRunLoopRemoveTimer(r1,  timer, mode);
	}

	public runLoopStop(r1: any): void {
		this.coreFoundationLibrary.CFRunLoopStop(r1);
	}

	public stringGetCStringPtr(theString: NodeBuffer, encoding: number): any {
		return this.coreFoundationLibrary.CFStringGetCStringPtr(theString, encoding);
	}

	public stringGetLength(theString: NodeBuffer): number {
		return this.coreFoundationLibrary.CFStringGetLength(theString);
	}

	public stringGetCString(theString: NodeBuffer, buffer: any, bufferSize: number, encoding: number): boolean {
		return this.coreFoundationLibrary.CFStringGetCString(theString, buffer, bufferSize, encoding);
	}

	public stringCreateWithCString(alloc: NodeBuffer, str: string, encoding: number): NodeBuffer {
		return this.coreFoundationLibrary.CFStringCreateWithCString(alloc, str, encoding);
	}

	public dictionaryCreate(allocator: NodeBuffer, keys: NodeBuffer, values: NodeBuffer, count: number, dictionaryKeyCallbacks: NodeBuffer, dictionaryValueCallbacks: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFDictionaryCreate(allocator, keys, values, count, dictionaryKeyCallbacks, dictionaryValueCallbacks);
	}

	public dictionaryGetValue(theDict: NodeBuffer, value: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFDictionaryGetValue(theDict, value);
	}

	public numberGetValue(number: NodeBuffer, theType: number, valuePtr: NodeBuffer): boolean {
		return this.coreFoundationLibrary.CFNumberGetValue(number, theType, valuePtr);
	}

	public  getTypeID(type: NodeBuffer): number {
		return this.coreFoundationLibrary.CFGetTypeID();
	}

	public dictionaryGetCount(theDict: NodeBuffer): number {
		return this.coreFoundationLibrary.CFDictionaryGetCount(theDict);
	}

	public createCFString(str: string): NodeBuffer {
		return this.stringCreateWithCString(null, str, IOSCore.kCFStringEncodingUTF8 );
	}

	public convertCFStringToCString(cfstr) {
		var result;
		if (cfstr != null) {
			result = this.stringGetCStringPtr(cfstr, IOSCore.kCFStringEncodingUTF8 );
			if (ref.address(result) === 0) {
				var cfstrLength = this.stringGetLength(cfstr);
				var length = cfstrLength + 1;
				var stringBuffer = new Buffer(length);
				var status = this.stringGetCString(cfstr, stringBuffer, length, IOSCore.kCFStringEncodingUTF8 );
				if (status) {
					result = stringBuffer.toString("utf8", 0, cfstrLength);
				} else {
					throw "Unable to convert string: " + result;
				}
			} else {
				result = ref.readCString(result, 0);
			}
		}

		return result;
	}
}
$injector.register("coreFoundation", CoreFoundation);

export class MobileDevice implements Mobile.IMobileDevice {
	private mobileDeviceLibrary: any;

	constructor($iOSCore: Mobile.IiOSCore) {
		this.mobileDeviceLibrary = $iOSCore.getMobileDeviceLibrary();
	}

	public deviceNotificationSubscribe(notificationCallback: NodeBuffer, p1: number, p2: number, p3: number, callbackSignature: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceNotificationSubscribe(notificationCallback, p1, p2, p3, callbackSignature);
	}

	public deviceCopyDeviceIdentifier(devicePointer: NodeBuffer): NodeBuffer {
		return this.mobileDeviceLibrary.AMDeviceCopyDeviceIdentifier(devicePointer);
	}

	public deviceConnect(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceConnect(devicePointer);
	}

	public deviceIsPaired(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceIsPaired(devicePointer);
	}

	public devicePair(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDevicePair(devicePointer);
	}

	public deviceValidatePairing(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceValidatePairing(devicePointer);
	}

	public deviceStartSession(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceStartSession(devicePointer);
	}

	public deviceStopSession(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceStopSession(devicePointer);
	}

	public deviceDisconnect(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceDisconnect(devicePointer);
	}

	public deviceStartService(devicePointer: NodeBuffer, serviceName: NodeBuffer, socketNumber: NodeBuffer) {
		return this.mobileDeviceLibrary.AMDeviceStartService(devicePointer, serviceName, socketNumber, null);
	}

	public deviceTransferApplication(service: number, packageFile: NodeBuffer, options: NodeBuffer, installationCallback: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceTransferApplication(service, packageFile, options, installationCallback, null);
	}

	public deviceInstallApplication(service: number, packageFile: NodeBuffer, options: NodeBuffer, installationCallback: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceInstallApplication(service, packageFile, options, installationCallback, null);
	}

	public afcConnectionOpen(service: number, timeout: number, afcConnection: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCConnectionOpen(service, timeout, afcConnection);
	}

	public afcConnectionClose(afcConnection: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCConnectionClose(afcConnection);
	}

	public afcDirectoryCreate(afcConnection: NodeBuffer, path: string): number {
		return this.mobileDeviceLibrary.AFCDirectoryCreate(afcConnection, path);
	}

	public afcFileRefOpen(afcConnection: NodeBuffer, path: string, mode: number, timeout: number, afcFileRef: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCFileRefOpen(afcConnection, path, mode, timeout, afcFileRef);
	}

	public afcFileRefClose(afcConnection: NodeBuffer, afcFileRef: number): number {
		return this.mobileDeviceLibrary.AFCFileRefClose(afcConnection, afcFileRef);
	}

	public afcFileRefWrite(afcConnection: NodeBuffer, afcFileRef: number, buffer: NodeBuffer, byteLength: number): number {
		return this.mobileDeviceLibrary.AFCFileRefWrite(afcConnection, afcFileRef, buffer, byteLength);
	}

	public afcFileRefRead(afcConnection: NodeBuffer, afcFileRef: number, buffer: NodeBuffer, byteLength: number): number {
		return this.mobileDeviceLibrary.AFCFileRefRead(afcConnection, afcFileRef, buffer, byteLength);
	}

	public afcDirectoryOpen(afcConnection: NodeBuffer, path: string, afcDirectory: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCDirectoryOpen(afcConnection, path, afcDirectory);
	}

	public afcDirectoryRead(afcConnection: NodeBuffer, afcDirectory: NodeBuffer,  name: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCDirectoryRead(afcConnection, afcDirectory, name);
	}

	public afcDirectoryClose(afcConnection: NodeBuffer, afcDirectory: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCDirectoryClose(afcConnection, afcDirectory);
	}
}
$injector.register("mobileDevice", MobileDevice);

export class WinSocketWrapper {
	private winSocketLibrary: any = null;
	private static BYTES_TO_READ = 1024;

	constructor(private socket: number,
		private $errors: IErrors) {
		this.winSocketLibrary = IOSCore.getWinSocketLibrary();
	}

	public read(bytes: number): NodeBuffer {
		var data = new Buffer(bytes);
		var result = this.winSocketLibrary.recv(this.socket, data, bytes, 0);
		if (result < 0) {
			this.$errors.fail("Error receiving data: %s", result);
		}

		return data;
	}

	public readAll(printData: any) {
		var data = this.read(WinSocketWrapper.BYTES_TO_READ);
		while (data) {
			printData(data);
			data = this.read(WinSocketWrapper.BYTES_TO_READ);
		}
		this.close();
	}

	public write(data: string): number {
		return this.winSocketLibrary.send(this.socket, data, data.length, 0);
	}

	public close(): number {
		return this.winSocketLibrary.closesocket(this.socket);
	}
}

export class PlistService {
	private socket: any  = null;

	constructor(private service: number,
		private $errors: IErrors) {
		if(helpers.isWindows()) {
			this.socket = new WinSocketWrapper(this.service, this.$errors);
		} else if(helpers.isDarwin()) {
			this.socket = new net.Socket({ fd: this.service });
		}
	}

	public receiveMessage(): string {
		var data = this.socket.read(4);
		var reply = "";

		if (data !== null && data.length === 4) {
			var l = bufferpack.unpack(">i", data)[0];
			var left = l;
			while (left > 0) {
				var r = this.socket.read(left);
				if (r === null) {
					throw "Unable to read reply";
				}
				reply += r;
				left -= r.length;
			}
		}

		return reply;
	}

	public receiveAll(condition: boolean): string {
		var reply = this.receiveMessage();

		while (condition) {
			reply += "\n" + this.receiveMessage();
		}

		return reply;
	}

	public sendMessage(data) {
		var payload = plistlib.toString(data);
		var message = bufferpack.pack(">i", [payload.length]) + payload;
		return this.socket.write(message);
	}

	public disconnect() {
		this.socket.close();
	}
}