///<reference path=".d.ts"/>
"use strict";
import path = require("path");
import util = require("util");
import fiber = require("fibers");
import helpers = require("./helpers");
import staticConfigBaseLib = require("./common/static-config-base");

export class Configuration implements IConfiguration { // User specific config
	AB_SERVER_PROTO: string;
	AB_SERVER: string;
	DEBUG :boolean;
	PROXY_TO_FIDDLER: boolean;
	FIDDLER_HOSTNAME: string;
	DEFAULT_CORDOVA_PROJECT_TEMPLATE: string;
	DEFAULT_NATIVESCRIPT_PROJECT_TEMPLATE: string;
	DEFAULT_WEBSITE_PROJECT_TEMPLATE: string;
	CORDOVA_PLUGINS_REGISTRY: string;
	CI_LOGGER: boolean;
	USE_CDN_FOR_EXTENSION_DOWNLOAD: boolean;
	AUTO_UPGRADE_PROJECT_FILE: boolean;
	TYPESCRIPT_COMPILER_OPTIONS: ITypeScriptCompilerOptions;

	/*don't require logger and everything that has logger as dependency in config.js due to cyclic dependency*/
	constructor(private $fs: IFileSystem) {
		var configPath = this.getConfigPath("config");
		if (!this.$fs.exists(configPath).wait()) {
			var configBase = this.loadConfig("config-base").wait();
			this.$fs.writeJson(configPath, configBase).wait();
		} else {
			this.mergeConfig(this, this.loadConfig("config").wait());
		}
	}

	public reset(): IFuture<void> {
		return this.copyFile(this.getConfigPath("config-base"), this.getConfigPath("config"));
	}

	public apply(configName: string): IFuture<void> {
		return ((): any => {
			var baseConfig = this.loadConfig("config-base").wait();
			var newConfig = this.loadConfig("config-" + configName).wait();
			this.mergeConfig(baseConfig, newConfig);
			this.saveConfig(baseConfig, "config").wait();
		}).future<void>()();
	}

	public printConfigData(): IFuture<void> {
		return (() => {
			var config = this.loadConfig("config").wait();
			console.log(config);
		}).future<void>()();
	}

	private getConfigPath(filename: string) : string {
		return path.join(__dirname, "../config/", filename + ".json");
	}

	private copyFile(from: string, to: string): IFuture<void> {
		return this.$fs.copyFile(from, to);
	}

	private loadConfig(name: string): IFuture<any> {
		var configFileName = this.getConfigPath(name);
		return this.$fs.readJson(configFileName);
	}

	private saveConfig(config: IConfiguration, name: string): IFuture<void> {
		var configNoFunctions = Object.create(null);
		_.each(<any>config, (entry, key) => {
			if (typeof entry !== "function") {
				configNoFunctions[key] = entry;
			}
		});

		var configFileName = this.getConfigPath(name);
		return this.$fs.writeJson(configFileName, configNoFunctions);
	}

	private mergeConfig(config: IConfiguration, mergeFrom: IConfiguration): void {
		_.extend(config, mergeFrom);
	}
}
$injector.register("config", Configuration);

export class StaticConfig extends staticConfigBaseLib.StaticConfigBase implements IStaticConfig {
	public PROJECT_FILE_NAME = ".abproject";
	public CLIENT_NAME = "appbuilder";
	public ANALYTICS_API_KEY = "13eaa7db90224aa1861937fc71863ab8";
	public TRACK_FEATURE_USAGE_SETTING_NAME = "AnalyticsSettings.TrackFeatureUsage";
	public ANALYTICS_INSTALLATION_ID_SETTING_NAME = "AnalyticsInstallationID";

	public get START_PACKAGE_ACTIVITY_NAME(): string {
		var project: Project.IProject = $injector.resolve("project");
		return project.startPackageActivity;
	}

	public SOLUTION_SPACE_NAME = "Private_Build_Folder";
	public QR_SIZE = 300;

	public version = require("../package.json").version;

	public triggerJsonSchemaValidation = true;

	public get helpTextPath() {
		return path.join(__dirname, "../resources/help.txt");
	}
}
$injector.register("staticConfig", StaticConfig);
