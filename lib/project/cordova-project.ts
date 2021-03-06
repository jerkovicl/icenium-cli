///<reference path="../.d.ts"/>
"use strict";

import path = require("path");
import util = require("util");

import frameworkProjectBaseLib = require("./framework-project-base");
import helpers = require("./../common/helpers");
import MobileHelper = require("../common/mobile/mobile-helper");
import options = require("../common/options");

export class CordovaProject extends frameworkProjectBaseLib.FrameworkProjectBase implements Project.IFrameworkProject {
	private static WP8_DEFAULT_PACKAGE_IDENTITY_NAME_PREFIX = "1234Telerik";
	private static WP8_DEFAULT_WP8_WINDOWS_PUBLISHER_NAME = "CN=Telerik";

	constructor(private $config: IConfiguration,
		$fs: IFileSystem,
		$errors: IErrors,
		private $jsonSchemaConstants: IJsonSchemaConstants,
		$jsonSchemaValidator: IJsonSchemaValidator,
		$logger: ILogger,
		private $projectConstants: Project.IProjectConstants,
		private $projectFilesManager: Project.IProjectFilesManager,
		private $templatesService: ITemplatesService,
		$resources: IResourceLoader) {
		super($logger, $fs, $resources, $errors, $jsonSchemaValidator);
	}

	public get name(): string {
		return this.$projectConstants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova;
	}

	public get capabilities(): IProjectCapabilities {
		return {
			build: true,
			buildCompanion: true,
			deploy: true,
			simulate: true,
			livesync: true,
			livesyncCompanion: true,
			updateKendo: true,
			emulate: true
		};
	}

	public get defaultProjectTemplate(): string {
		return this.$config.DEFAULT_CORDOVA_PROJECT_TEMPLATE;
	}

	public get liveSyncUrl(): string {
		return "icenium://";
	}

	public get requiredAndroidApiLevel(): number {
		return 10;  // 2.3 Gingerbread
	}

	public get configFiles(): Project.IConfigurationFile[] {
		var allConfigFiles = this.$projectFilesManager.availableConfigFiles;
		return [
			allConfigFiles["cordova-android-manifest"],
			allConfigFiles["android-config"],
			allConfigFiles["ios-info"],
			allConfigFiles["ios-config"],
			allConfigFiles["wp8-manifest"],
			allConfigFiles["wp8-config"]
		]
	}

	public get startPackageActivity(): string {
		return ".TelerikCallbackActivity";
	}

	public getValidationSchemaId(): string {
		return this.$jsonSchemaConstants.CORDOVA_VERSION_3_SCHEMA_ID;
	}

	public getProjectTargets(projectDir: string): IFuture<string[]> {
		var fileMask = /^cordova\.(\w*)\.js$/i;
		return this.getProjectTargetsBase(projectDir, fileMask);
	}

	public getTemplateFilename(name: string): string {
		return util.format("Telerik.Mobile.Cordova.%s.zip", name);
	}

	public alterPropertiesForNewProject(properties: any, projectName: string): void {
		this.alterPropertiesForNewProjectBase(properties, projectName);

		properties.WP8ProductID = helpers.createGUID();
		properties.WP8PublisherID = helpers.createGUID();
		properties.WP8PackageIdentityName = this.getCorrectWP8PackageIdentityName(properties.ProjectName);
	}

	private getCorrectWP8PackageIdentityName(projectName: string) {
		var sanitizedName = projectName ? _.filter(projectName.split(""),(c) => /[a-zA-Z0-9.-]/.test(c)).join("") : "";
		return util.format("%s.%s", CordovaProject.WP8_DEFAULT_PACKAGE_IDENTITY_NAME_PREFIX, sanitizedName); 
	}

	public projectTemplatesString(): IFuture<string> {
		return this.$templatesService.getTemplatesString(/.*Telerik\.Mobile\.Cordova\.(.+)\.zip/);
	}

	public getProjectFileSchema(): IDictionary<any> {
		return this.getProjectFileSchemaByName(this.name);
	}

	public adjustBuildProperties(buildProperties: any, projectInformation?: Project.IProjectInformation): any {
		var projectData = projectInformation.projectData;
		var configurationName = options.release ? "release" : "debug";
		buildProperties.CorePlugins = this.getProperty("CorePlugins", configurationName, projectInformation);

		if(buildProperties.Platform === "WP8") {
			buildProperties.WP8ProductID = projectData.WP8ProductID || MobileHelper.generateWP8GUID();
			buildProperties.WP8PublisherID = projectData.WP8PublisherID;
			buildProperties.WP8Publisher = projectData.WP8Publisher;
			buildProperties.WP8TileTitle = projectData.WP8TileTitle;
			buildProperties.WP8Capabilities = projectData.WP8Capabilities;
			buildProperties.WP8Requirements = projectData.WP8Requirements;
			buildProperties.WP8SupportedResolutions = projectData.WP8SupportedResolutions;
			buildProperties.WP8PackageIdentityName = projectData.WP8PackageIdentityName;
			buildProperties.WP8WindowsPublisherName = projectData.WP8WindowsPublisherName;
		}

		return buildProperties;
	}

	public ensureAllPlatformAssets(projectDir: string, frameworkVersion: string): IFuture<void> {
		return (() => {
			var platforms = _.keys(MobileHelper.platformCapabilities);
			_.each(platforms, (platform: string) => this.ensureCordovaJs(platform, projectDir, frameworkVersion).wait());

			var appResourcesDir = this.$resources.appResourcesDir;
			var appResourceFiles = this.$fs.enumerateFilesInDirectorySync(appResourcesDir);
			appResourceFiles.forEach((appResourceFile) => {
				var relativePath = path.relative(appResourcesDir, appResourceFile);
				var targetFilePath = path.join(projectDir, relativePath);
				this.$logger.trace("Checking app resources: %s must match %s", appResourceFile, targetFilePath);
				if (!this.$fs.exists(targetFilePath).wait()) {
					this.printAssetUpdateMessage();
					this.$logger.trace("File not found, copying %s", appResourceFile);
					this.$fs.copyFile(appResourceFile, targetFilePath).wait();
				}
			});

		}).future<void>()();
	}

	private ensureCordovaJs(platform: string, projectDir: string, frameworkVersion: string): IFuture<void> {
		return (() => {
			var cordovaJsFileName = path.join(projectDir, util.format("cordova.%s.js", platform).toLowerCase());
			if (!this.$fs.exists(cordovaJsFileName).wait()) {
				this.printAssetUpdateMessage();
				var cordovaJsSourceFilePath = this.$resources.buildCordovaJsFilePath(frameworkVersion, platform);
				this.$fs.copyFile(cordovaJsSourceFilePath, cordovaJsFileName).wait();
			}
		}).future<void>()();
	}

	public completeProjectProperties(properties: any): boolean {
		var updated = false;

		if (_.has(properties, "name")) {
			properties.ProjectName = properties.name;
			delete properties.name;
			updated = true;
		}

		if (_.has(properties, "iOSDisplayName")) {
			properties.DisplayName = properties.iOSDisplayName;
			delete properties.iOSDisplayName;
			updated = true;
		}
		if (!properties.DisplayName) {
			properties.DisplayName = properties.ProjectName;
			updated = true;
		}

		["WP8PublisherID", "WP8ProductID"].forEach((wp8guid) => {
			if (!_.has(properties, wp8guid) || properties[wp8guid] === "") {
				properties[wp8guid] = MobileHelper.generateWP8GUID();
				updated = true;
			}
		});

		if(!_.has(properties, "WP8PackageIdentityName")) {
			var wp8PackageIdentityName = this.getCorrectWP8PackageIdentityName(properties.ProjectName);
			this.$logger.warn("Missing 'WP8PackageIdentityName' property in .abproject. Default value '%s' will be used.", wp8PackageIdentityName);
			properties.WP8PackageIdentityName = wp8PackageIdentityName;
			updated = true;
		}

		if(!_.has(properties, "WP8WindowsPublisherName")) {
			var wp8WindowsPublisherName = CordovaProject.WP8_DEFAULT_WP8_WINDOWS_PUBLISHER_NAME;
			this.$logger.warn("Missing 'WP8WindowsPublisherName' property in .abproject. Default value '%s' will be used.", wp8WindowsPublisherName);
			properties.WP8WindowsPublisherName = wp8WindowsPublisherName;
			updated = true;
		}


		return updated;
	}
}
$injector.register("cordovaProject", CordovaProject);
