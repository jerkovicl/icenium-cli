///<reference path=".d.ts"/>
"use strict";

import os = require("os");
import path = require("path");
import util = require("util");

import commonHelpers = require("./common/helpers");
import helpers = require("./helpers");
import MobileHelper = require("./common/mobile/mobile-helper");
import options = require("./options");

export class Project implements Project.IProject {
	private static JSON_PROJECT_FILE_NAME_REGEX = "[.]abproject";
	private static CONFIGURATION_FILE_SEARCH_PATTERN: RegExp = new RegExp(".*.abproject$", "i");
	private static VALID_CONFIGURATION_CHARACTERS_REGEX = "[-_A-Za-z0-9]";
	private static CONFIGURATION_FROM_FILE_NAME_REGEX = new RegExp("^[.](" + Project.VALID_CONFIGURATION_CHARACTERS_REGEX + "+?)" + Project.JSON_PROJECT_FILE_NAME_REGEX + "$", "i");

	private _hasBuildConfigurations: boolean = false;
	private _projectSchema: any;
	private cachedProjectDir: string = "";
	private frameworkProject: Project.IFrameworkProject;

	public projectData: IProjectData;
	public configurationSpecificData: IDictionary<IDictionary<any>>;

	constructor(private $config: IConfiguration,
		private $cordovaMigrationService: ICordovaMigrationService,
		private $errors: IErrors,
		private $frameworkProjectResolver: Project.IFrameworkProjectResolver,
		private $fs: IFileSystem,
		private $logger: ILogger,
		private $projectConstants: Project.IProjectConstants,
		private $projectFilesManager: Project.IProjectFilesManager,
		private $projectPropertiesService: IProjectPropertiesService,
		private $resources: IResourceLoader,
		private $staticConfig: IStaticConfig,
		private $templatesService: ITemplatesService) {

		this.configurationSpecificData = Object.create(null);
		this.readProjectData().wait();

		if(this.projectData && this.projectData["TemplateAppName"]) {
			this.$errors.fail({
				formatStr: "This hybrid project targets Apache Cordova 2.x. " +
					"The AppBuilder CLI lets you target only Apache Cordova 3.0.0 or later. " +
					"To develop your projects with Apache Cordova 2.x, run the AppBuilder Windows client or the in-browser client.",
				suppressCommandHelp: true
			});
		}
	}

	public get capabilities(): IProjectCapabilities {
		return this.frameworkProject.capabilities;
	}

	public getLiveSyncUrl(): string {
		return this.frameworkProject.liveSyncUrl;
	}

	public get projectConfigFiles(): Project.IConfigurationFile[] {
		return this.frameworkProject.configFiles;
	}

	public getProjectTargets(): IFuture<string[]> {
		return (() => {
			var projectDir = this.getProjectDir().wait();
			var projectTargets = this.frameworkProject.getProjectTargets(projectDir).wait();
			return projectTargets;
		}).future<string[]>()();
	}

	public configurationFilesString(): string {
		return _.map(this.projectConfigFiles, (file) => {
			return util.format("        %s - %s", file.template, file.helpText);
		}).join("\n");
	}

	public get configurations(): string[] {
		var configurations: string[] = [];
		if(options.debug || options.d) {
			configurations.push(this.$projectConstants.DEBUG_CONFIGURATION_NAME);
		}

		if(options.release || options.r) {
			configurations.push(this.$projectConstants.RELEASE_CONFIGURATION_NAME);
		}

		if(configurations.length === 0) {
			configurations.push(this.$projectConstants.DEBUG_CONFIGURATION_NAME);
			configurations.push(this.$projectConstants.RELEASE_CONFIGURATION_NAME);
		}

		return configurations;
	}

	public hasBuildConfigurations(): boolean {
		return this._hasBuildConfigurations;
	}

	public getBuildConfiguration(): string {
		var configuration = options.release || options.r ? this.$projectConstants.RELEASE_CONFIGURATION_NAME : this.$projectConstants.DEBUG_CONFIGURATION_NAME;
		return configuration.charAt(0).toUpperCase() + configuration.slice(1);
	}

	public getProperty(propertyName: string, configuration: string): any {
		var propertyValue: any = null;

		if(this._hasBuildConfigurations) {
			var configData = this.configurationSpecificData[configuration];
			if(configData) {
				propertyValue = configData[propertyName];
			}
		} else {
			propertyValue = this.projectData[propertyName];
		}

		return propertyValue;
	}

	public setProperty(propertyName: string, value: any, configuration: string): void {
		if(this._hasBuildConfigurations) {
			var configData = this.configurationSpecificData[configuration];
			if (!configData) {
				configData = Object.create(null);
				this.configurationSpecificData[configuration] = configData;
			}

			configData[propertyName] = value;
		} else {
			this.projectData[propertyName] = value;
		}
	}

	public getProjectDir(): IFuture<string> {
		return (() => {
			if(this.cachedProjectDir !== "") {
				return this.cachedProjectDir;
			}
			this.cachedProjectDir = null;

			var projectDir = path.resolve(options.path || ".");
			while(true) {
				this.$logger.trace("Looking for project in '%s'", projectDir);

				if(this.$fs.exists(path.join(projectDir, this.$staticConfig.PROJECT_FILE_NAME)).wait()) {
					this.$logger.debug("Project directory is '%s'.", projectDir);
					this.cachedProjectDir = projectDir;
					break;
				}

				var dir = path.dirname(projectDir);
				if(dir === projectDir) {
					this.$logger.debug("No project found at or above '%s'.", path.resolve("."));
					break;
				}
				projectDir = dir;
			}

			return this.cachedProjectDir;
		}).future<string>()();
	}

	public createTemplateFolder(projectDir: string): IFuture<void> {
		return (() => {
			this.$fs.createDirectory(projectDir).wait();
			var projectDirFiles = this.$fs.readDirectory(projectDir).wait();
			if(projectDirFiles.length !== 0) {
				this.$errors.fail("The specified directory must be empty to create a new project.");
			}
		}).future<void>()();
	}

	public createProjectFile(projectDir: string, properties: any): IFuture<void> {
		return ((): void => {
			properties = properties || {};

			this.$fs.createDirectory(projectDir).wait();
			this.cachedProjectDir = projectDir;
			var defaultProjectFilePath = this.$resources.resolvePath(util.format("default-project-%s.json", this.frameworkProject.name.toLowerCase()));
			this.projectData = this.$fs.readJson(defaultProjectFilePath).wait();
			this.frameworkProject = this.$frameworkProjectResolver.resolve(this.projectData.Framework);

			this.validateProjectData(properties).wait();
			this.$projectPropertiesService.completeProjectProperties(this.projectData, this.frameworkProject);

			this.saveProject(projectDir).wait();
		}).future<void>()();
	}

	public createNewProject(projectName: string, framework: string): IFuture<void> {
		if(!projectName) {
			this.$errors.fail("No project name specified.")
		}

		var projectDir = this.getNewProjectDir();
		this.frameworkProject = this.$frameworkProjectResolver.resolve(framework);
		return this.createFromTemplate(projectName, projectDir);
	}

	public initializeProjectFromExistingFiles(framework: string): IFuture<void> {
		return ((): void => {
			var projectDir = this.getNewProjectDir();
			if(!this.$fs.exists(projectDir).wait()) {
				this.$errors.fail({ formatStr: util.format("The specified folder '%s' does not exist!", projectDir), suppressCommandHelp: true });
			}

			var projectFile = path.join(projectDir, this.$staticConfig.PROJECT_FILE_NAME);
			if(this.$fs.exists(projectFile).wait()) {
				this.$errors.fail({ formatStr: "The specified folder is already an AppBuilder command line project!", suppressCommandHelp: true });
			}

			this.frameworkProject = this.$frameworkProjectResolver.resolve(framework);
			this.createProjectFileFromExistingProject(projectDir).wait();
			var blankTemplateFile = this.frameworkProject.getTemplateFilename("Blank");
			this.$fs.unzip(path.join(this.$templatesService.projectTemplatesDir, blankTemplateFile), projectDir, { overwriteExisitingFiles: false }, [".*.abproject", ".abignore"]).wait();
		}).future<void>()();
	}

	private createProjectFileFromExistingProject(projectDir: string): IFuture<void> {
		return ((): void => {
			var appname = path.basename(projectDir);
			var properties = this.getProjectPropertiesFromExistingProject(projectDir, appname).wait();
			if(!properties) {
				properties = this.alterPropertiesForNewProject({}, appname);
			}

			try {
				this.createProjectFile(projectDir, properties).wait();
				this.$logger.info("Successfully initialized project in the folder.");
			}
			catch(e) {
				this.$errors.fail("There was an error while initialising the project: " + os.EOL + e);
			}
		}).future<void>()();
	}

	public getNewProjectDir() {
		return options.path || process.cwd();
	}

	public ensureProject(): void {
		if(!this.projectData) {
			this.$errors.fail("No project found at or above '%s' and neither was a --path specified.", process.cwd());
		}
	}

	public ensureCordovaProject() {
		this.ensureProject();

		if(this.projectData.Framework !== this.$projectConstants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova) {
			this.$errors.fail("This is not a valid Cordova project.");
		}
	}

	public enumerateProjectFiles(additionalExcludedProjectDirsAndFiles?: string[]): IFuture<string[]> {
		return (() => {
			var projectDir = this.getProjectDir().wait();
			var projectFiles = this.$projectFilesManager.enumerateProjectFiles(projectDir, additionalExcludedProjectDirsAndFiles).wait();
			return projectFiles;
		}).future<string[]>()();
	}

	public onFrameworkVersionChanging(newVersion: string): IFuture<void> {
		return ((): void => {
			if(newVersion === this.projectData.FrameworkVersion) {
				return;
			}

			var versionDisplayName = this.$cordovaMigrationService.getDisplayNameForVersion(newVersion).wait();
			this.$logger.info("Migrating to Cordova version %s", versionDisplayName);
			var oldVersion = this.projectData.FrameworkVersion;
			var newPluginsList = this.$cordovaMigrationService.migratePlugins(this.projectData.CorePlugins, oldVersion, newVersion).wait();
			this.$logger.trace("Migrated core plugins to: ", helpers.formatListOfNames(newPluginsList, "and"));
			this.projectData.CorePlugins = newPluginsList;

			var successfullyChanged: string[] = [],
				backupSuffix = ".backup";
			try {
				Object.keys(MobileHelper.platformCapabilities).forEach((platform) => {
					this.$logger.trace("Replacing cordova.js file for %s platform ", platform);
					var cordovaJsFileName = path.join(this.getProjectDir().wait(), util.format("cordova.%s.js", platform).toLowerCase());
					var cordovaJsSourceFilePath = this.$resources.buildCordovaJsFilePath(newVersion, platform);
					this.$fs.copyFile(cordovaJsFileName, cordovaJsFileName + backupSuffix).wait();
					this.$fs.copyFile(cordovaJsSourceFilePath, cordovaJsFileName).wait();
					successfullyChanged.push(cordovaJsFileName);
				});
			} catch(error) {
				_.each(successfullyChanged, file => {
					this.$logger.trace("Reverting %s", file);
					this.$fs.copyFile(file + backupSuffix, file).wait();
				});
				throw error;
			}
			finally {
				_.each(successfullyChanged, file => {
					this.$fs.deleteFile(file + backupSuffix).wait();
				});
			}

			this.$logger.info("Successfully migrated to version %s", versionDisplayName);
		}).future<void>()();
	}

	public getSupportedPlugins(): IFuture<string[]> {
		return (() => {
			var version: string;
			if(this.projectData) {
				version = this.projectData.FrameworkVersion;
			} else {
				var selectedFramework = _.last(_.select(this.$cordovaMigrationService.getSupportedFrameworks().wait(), (sv: Server.FrameworkVersion) => sv.DisplayName.indexOf("Experimental") === -1));
				version = selectedFramework.Version;
			}

			return this.$cordovaMigrationService.pluginsForVersion(version).wait();
		}).future<string[]>()();
	}

	public get projectTargets(): IFuture<string[]> {
		return (() => {
			var projectDir = this.getProjectDir().wait();
			var projectTargets = this.frameworkProject.getProjectTargets(projectDir).wait();

			return projectTargets;
		}).future<string[]>()();
	}

	public getTempDir(extraSubdir?: string): IFuture<string> {
		return (() => {
			var dir = path.join(this.getProjectDir().wait(), ".ab");
			this.$fs.createDirectory(dir).wait();
			if(extraSubdir) {
				dir = path.join(dir, extraSubdir);
				this.$fs.createDirectory(dir).wait();
			}
			return dir;
		}).future<string>()();
	}

	public updateProjectPropertyAndSave(mode: string, propertyName: string, propertyValues: string[]): IFuture<void> {
		return (() => {
			this.ensureProject();

			this.$projectPropertiesService.updateProjectProperty(this.projectData, mode, propertyName, propertyValues, this.getProjectSchema().wait(), true).wait();
			this.printProjectProperty(propertyName).wait();
			this.saveProject(this.getProjectDir().wait()).wait();
		}).future<void>()();
	}

	public printProjectProperty(property: string): IFuture<void> {
		return (() => {
			this.ensureProject();

			property = this.$projectPropertiesService.normalizePropertyName(property, this.getProjectSchema().wait());

			if(this.projectData.hasOwnProperty(property)) {
				this.$logger.out(this.projectData[property]);
			} else if(property) {
				this.$errors.fail("Unrecognized project property '%s'", property);
			} else {
				Object.keys(this.projectData).forEach((propName) => {
					// We get here in case you do not pass property, so we'll print all properties - appbuilder prop print
					this.$logger.out(propName + ": " + this.projectData[propName]);
				});
			}
		}).future<void>()();
	}

	public validateProjectProperty(property: string, args: string[], mode: string): IFuture<boolean> {
		return (() => {
			this.ensureProject();
			var projectSchema = this.getProjectSchema().wait();

			property = this.$projectPropertiesService.normalizePropertyName(property, projectSchema);

			if(this.projectData.hasOwnProperty(property)) {
				var propData = projectSchema[property];
				if(!propData) {
					this.$errors.fail("Unrecognized project property '%s'", property);
				}

				if(!propData.flags) {
					if(args.length !== 1) {
						this.$errors.fail("Property '%s' is not a collection of flags. Specify only a single property value.", property);
					}

					if(mode === "add" || mode === "del") {
						this.$errors.fail("Property '%s' is not a collection of flags. Use prop-set to set a property value.", property);
					}
				}

				return true;
			}

			return false;
		}).future<boolean>()();
	}

	public getProjectSchema(): IFuture<any> {
		return (() => {
			if(!this._projectSchema) {
				this._projectSchema = this.frameworkProject.getFullProjectFileSchema().wait();
			}

			return this._projectSchema;
		}).future<any>()();
	}

	public adjustBuildProperties(buildProperties: any): any {
		return this.frameworkProject.adjustBuildProperties(buildProperties, this.projectData);
	}

	public get requiredAndroidApiLevel(): number {
		return this.frameworkProject.requiredAndroidApiLevel;
	}

	public ensureAllPlatformAssets(): IFuture<void> {
		return (() => {
			var projectDir = this.getProjectDir().wait();
			this.frameworkProject.ensureAllPlatformAssets(projectDir, this.projectData.FrameworkVersion).wait();
		}).future<void>()();
	}

	private validateProjectData(properties: any): IFuture<void> {
		return (() => {
			var updateData: any;
			var projectSchema = this.getProjectSchema().wait();

			var keys = _.keys(properties);
			_.each(keys, (propertyName: string) => {
				if(_.has(projectSchema, propertyName)) {
					if(projectSchema[propertyName].flags) {
						if(_.isArray(properties[propertyName])) {
							this.projectData[propertyName] = properties[propertyName];
						} else {
							this.projectData[propertyName] = properties[propertyName] !== "" ? properties[propertyName].split(";") : [];
						}
						updateData = this.projectData[propertyName];
					} else {
						this.projectData[propertyName] = properties[propertyName];
						updateData = [this.projectData[propertyName]];
					}

					//triggers validation logic
					this.$projectPropertiesService.updateProjectProperty({}, "set", propertyName, updateData, projectSchema, false).wait();
				}
			});
		}).future<void>()();
	}

	public saveProject(projectDir: string): IFuture<void> {
		return (() => {
			projectDir = projectDir || this.getProjectDir().wait();
			this.$fs.writeJson(path.join(projectDir, this.$staticConfig.PROJECT_FILE_NAME), this.projectData).wait();

			_.each(this.configurations, (configuration: string) => {
				var configFilePath = path.join(projectDir, util.format(".%s%s", configuration, this.$projectConstants.PROJECT_FILE));
				if(this.$fs.exists(configFilePath).wait() && this.configurationSpecificData[configuration]) {
					this.$fs.writeJson(configFilePath, this.configurationSpecificData[configuration]).wait();
				}
			});
		}).future<void>()();
	}

	private readProjectData(): IFuture<void> {
		return (() => {
			var projectDir = this.getProjectDir().wait();

			if (projectDir) {
				var projectFilePath = path.join(projectDir, this.$staticConfig.PROJECT_FILE_NAME);
				try {
					var data = this.$fs.readJson(projectFilePath).wait();

					if (data.projectVersion && data.projectVersion !== 1) {
						throw "FUTURE_PROJECT_VER";
					}

					this.projectData = data;
					this.frameworkProject = this.$frameworkProjectResolver.resolve(this.projectData.Framework);

					var allProjectFiles = commonHelpers.enumerateFilesInDirectorySync(projectDir, (file: string, stat: IFsStats) => {
						return Project.CONFIGURATION_FILE_SEARCH_PATTERN.test(file);
					});

					_.each(allProjectFiles, (configProjectFile: string) => {
						var configMatch = path.basename(configProjectFile).match(Project.CONFIGURATION_FROM_FILE_NAME_REGEX);
						if(configMatch && configMatch.length > 1) {
							var configurationName = configMatch[1];
							var configProjectContent = this.$fs.readJson(configProjectFile).wait();
							this.configurationSpecificData[configurationName.toLowerCase()] = configProjectContent;
							this._hasBuildConfigurations = true;
						}
					});

				} catch (err) {
					if (err === "FUTURE_PROJECT_VER") {
						this.$errors.fail({
							formatStr: "This project is created by a newer version of AppBuilder. Upgrade AppBuilder CLI to work with it.",
							suppressCommandHelp: true
						});
					}
					this.$errors.fail({formatStr: "The project file %s is corrupted." + os.EOL +
							"Consider restoring an earlier version from your source control or backup." + os.EOL +
							"To create a new one with the default settings, delete this file and run $ appbuilder init hybrid." + os.EOL +
							"Additional technical info: %s",
							suppressCommandHelp: true},
						projectFilePath, err.toString());
				}

				if (this.$projectPropertiesService.completeProjectProperties(this.projectData, this.frameworkProject) && this.$config.AUTO_UPGRADE_PROJECT_FILE) {
					this.saveProject(projectDir).wait();
				}
			}
		}).future<void>()();
	}

	private createFromTemplate(appname: string, projectDir: string): IFuture<void> {
		return (() => {
			var templatesDir = this.$templatesService.projectTemplatesDir;
			var template = options.template || this.frameworkProject.defaultProjectTemplate;
			var templateFileName = path.join(templatesDir, this.frameworkProject.getTemplateFilename(template));

			this.$logger.trace("Using template '%s'", templateFileName);
			if(this.$fs.exists(templateFileName).wait()) {
				projectDir = path.join(projectDir, appname);
				this.$logger.trace("Creating template folder '%s'", projectDir);
				this.createTemplateFolder(projectDir).wait();
				try {
					this.$logger.trace("Extracting template from '%s'", templateFileName);
					this.$fs.unzip(templateFileName, projectDir).wait();
					this.$logger.trace("Reading template project properties.");
					var properties = this.$projectPropertiesService.getProjectProperties(path.join(projectDir, this.$projectConstants.PROJECT_FILE), true, this.frameworkProject).wait();
					properties = this.alterPropertiesForNewProject(properties, appname);
					this.$logger.trace(properties);
					this.$logger.trace("Saving project file.");
					this.createProjectFile(projectDir, properties).wait();
					this.$logger.trace("Removing unnecessary files from template.");
					this.removeExtraFiles(projectDir).wait();
					this.$fs.createDirectory(path.join(projectDir, "hooks")).wait();
					this.$logger.info("Project '%s' has been successfully created in '%s'.", appname, projectDir);
				}
				catch(ex) {
					this.$fs.deleteDirectory(projectDir).wait();
					throw ex;
				}
			} else {
				var templates = this.frameworkProject.projectTemplatesString().wait();

				var message = util.format("The specified template %s does not exist. You can use any of the following templates: %s",
					options.template,
					os.EOL,
					templates);
				this.$errors.fail({ formatStr: message, suppressCommandHelp: true });
			}
		}).future<void>()();
	}

	private alterPropertiesForNewProject(properties: any, projectName: string): IProjectData {
		properties.ProjectGuid = commonHelpers.createGUID();
		properties.ProjectName = projectName;

		this.frameworkProject.alterPropertiesForNewProject(properties, projectName);

		return properties;
	}

	private removeExtraFiles(projectDir: string): IFuture<void> {
		return ((): void => {
			_.each(["mobile.vstemplate"],
				(file) => this.$fs.deleteFile(path.join(projectDir, file)).wait());
		}).future<void>()();
	}

	private getProjectPropertiesFromExistingProject(projectDir: string, appname: string): IFuture<IProjectData> {
		return ((): any => {
			var projectFile = _.find(this.$fs.readDirectory(projectDir).wait(), file => {
				var extension = path.extname(file);
				return extension == ".proj" || extension == ".iceproj";
			});

			if(projectFile) {
				return this.$projectPropertiesService.getProjectProperties(path.join(projectDir, projectFile), false, this.frameworkProject).wait();
			}

			this.$logger.warn("No AppBuilder project file found in folder. Creating project with default settings!");
			return null;
		}).future<IProjectData>()();
	}
}
$injector.register("project", Project);
