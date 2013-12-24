///<reference path=".d.ts"/>

(function() {
	"use strict";
	require("./extensions");
	var fs = require("fs"),
		path = require("path"),
		unzip = require("unzip"),
		_ = require("underscore"),
		config = require("./config"),
		options = require("./options"),
		log = require("./log"),
		util = require("util"),
		helpers = require("./helpers"),
		server = require("./server"),
		identity = require("./identity"),
		querystring = require("querystring"),
		xopen = require("open"),
		async = require("async"),
		devicesService = require("./devices-service.js"),
		Q = require("q"),
		cachedProjectDir = "",
		projectData;

	function hasProject() {
		var projectDir = getProjectDir();
		return !!projectDir;
	}

	function getProjectDir() {
		if (cachedProjectDir !== "") {
			return cachedProjectDir;
		}
		cachedProjectDir = null;

		var projectDir = options.path || path.resolve(".");
		while (true) {
			log.trace("Looking for project in '%s'", projectDir);

			if (fs.existsSync(path.join(projectDir, config.PROJECT_FILE_NAME))) {
				log.debug("Project directory is '%s'.", projectDir);
				cachedProjectDir = projectDir;
				break;
			}

			var dir = path.dirname(projectDir);
			if (dir === projectDir) {
				log.info("No project found at or above '%s'.", path.resolve("."));
				break;
			}
			projectDir = dir;
		}

		return cachedProjectDir;
	}

	function getTempDir() {
		var dir = path.join(getProjectDir(), ".ice");
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		return dir;
	}

	function getProjectRelativePath(fullPath) {
		var projectDir = getProjectDir() + path.sep;
		if (!fullPath.startsWith(projectDir)) {
			throw new Error("File is not part of the project.");
		}

		return fullPath.substring(projectDir.length);
	}

	function enumerateProjectFiles(excludedProjectDirsAndFiles) {
		if (!excludedProjectDirsAndFiles) {
			excludedProjectDirsAndFiles = [".ice"];
		}

		var projectDir = getProjectDir();
		var projectFiles = helpers.enumerateFilesInDirectorySync(projectDir, function(filePath) {
			return !excludedProjectDirsAndFiles.contains(path.basename(filePath).toLowerCase());
		});

		log.trace("enumerateProjectFiles: %s", util.inspect(projectFiles));
		return projectFiles;
	}

	function zipProject(callback) {
		helpers.ensureCallback(callback, 0);

		var tempDir = getTempDir();

		var projectZipFile = path.join(tempDir, "Build.zip");
		if (fs.existsSync(projectZipFile)) {
			fs.unlinkSync(projectZipFile);
		}

		var files = enumerateProjectFiles();
		helpers.zipFiles(projectZipFile, files,
			function(path) {
				return getProjectRelativePath(path);
			},
			function(err) {
				callback(err, {output: projectZipFile});
			});
	}

	function requestCloudBuild(platform, configuration, callback) {
		if (helpers.isAndroidPlatform(platform)) {
			platform = "Android";
		} else if (helpers.isiOSPlatform(platform)) {
			platform = "iOS";
		} else {
			log.fatal("Unknown platform '%s'. Must be either 'Android' or 'iOS'", platform);
			return;
		}

		var buildProperties = {
			Configuration: configuration,
			Platform: platform,

			CorePlugins: projectData.CorePlugins,
			AppIdentifier: projectData.AppIdentifier,
			ProjectName: projectData.name,
			ProjectGuid: projectData.ProjectGuid,
			FrameworkVersion: projectData.FrameworkVersion,
			BundleVersion: projectData.BundleVersion,
			DeviceOrientations: projectData.DeviceOrientations,
		};

		if (platform === "Android") {
			buildProperties.AndroidPermissions = projectData.AndroidPermissions;
			buildProperties.AndroidVersionCode = projectData.AndroidVersionCode;
			buildProperties.AndroidHardwareAcceleration = projectData.AndroidHardwareAcceleration;
			buildProperties.AndroidCodesigningIdentity = ""; //TODO: where do you get this from?

			beginBuild(buildProperties, callback);
		} else if (platform === "iOS" ) {
			buildProperties.iOSDisplayName = projectData.iOSDisplayName;
			buildProperties.iOSDeviceFamily = projectData.iOSDeviceFamily;
			buildProperties.iOSStatusBarStyle = projectData.iOSStatusBarStyle;
			buildProperties.iOSBackgroundMode = projectData.iOSBackgroundMode;

			identity.findCertificate(options.certificate, function(err, certificateData) {
				if (err) {
					throw err;
				}

				log.info("Using certificate '%s'", certificateData.Alias);

				identity.findProvision(options.provision, function(err, provisionData) {
					if (err) {
						throw err;
					}

					log.info("Using mobile provision '%s'", provisionData.Name);

					buildProperties.MobileProvisionIdentifier = provisionData.Identifier;
					buildProperties.iOSCodesigningIdentity = certificateData.Alias;

					beginBuild(buildProperties, function(err, buildResult) {
						if (!err) {
							buildResult.provisionType = provisionData.ProvisionType;
						}
						callback(err, buildResult);
					});
				});
			});
		}
	}

	function beginBuild(buildProperties, callback) {
		Object.keys(buildProperties).forEach(function(prop) {
			if (buildProperties[prop] === undefined) {
				callback(new Error(util.format("Build property '%s' is undefined.", prop)));
				return;
			}

			if (_.isArray(buildProperties[prop])) {
				buildProperties[prop] = buildProperties[prop].join(";");
			}
		});

		server.buildProject(projectData.name, projectData.name, config.SOLUTION_SPACE_NAME, buildProperties, function(err, result) {
			if (err) {
				callback(err);
				return;
			}
			
			if (result.output) {
				var buildLogFilePath = path.join(getTempDir(), "build.log");
				fs.writeFile(buildLogFilePath, result.output, function (err) {
					if (err) {
						throw err;
					}
					log.info("Build log written to '%s'", buildLogFilePath);
				});
			}

			log.debug(result.buildResults);

			callback(null, {
				buildProperties: buildProperties,
				packageDefs: result.buildResults,
			});
		});
	}

	function showPackageQRCodes(packageDefs) {
		if (!packageDefs.length) {
			return;
		}

		var templateFiles = helpers.enumerateFilesInDirectorySync(path.join(__dirname, "../resources/qr"));
		for (var i = 0; i < templateFiles.length; i++) {
			var srcFile = templateFiles[i];
			var targetFile = path.join(getTempDir(), path.basename(srcFile));
			log.debug("Copying '%s' to '%s'", srcFile, targetFile);

			var writeStream = fs.createWriteStream(targetFile);
			fs.createReadStream(srcFile).pipe(writeStream);
			if (path.basename(srcFile) === "scan.html") {
				var htmlTemplate = targetFile;
				writeStream.on("finish", function() {
					var htmlTemplateContents = fs.readFileSync(htmlTemplate, {encoding: "utf8"});
					htmlTemplateContents = htmlTemplateContents.replace(/\$ApplicationName\$/g, projectData.name)
						.replace(/\$Packages\$/g, JSON.stringify(packageDefs));
					fs.writeFile(htmlTemplate, htmlTemplateContents, function(err) {
						if (err) {
							throw err;
						}
						log.debug("Updated scan.html");
						xopen(htmlTemplate);
					});
				});
			}
		}
	}

	function build(platform, configuration, showQrCodes, downloadFiles, callback) {
		configuration = configuration || "Debug";
		log.info("Building project for platform '%s', configuration '%s'", platform, configuration);

		importProject(function(err) {
			if (err) {
				throw err;
			}
			requestCloudBuild(platform, configuration, function(err, buildResult) {
				if (err) {
					throw err;
				}
				var packageDefs = buildResult.packageDefs;

				if (showQrCodes && packageDefs.length) {
					async.map(packageDefs,
						function(def, callback) {
							var urlKind = buildResult.provisionType === "AdHoc" ? "manifest" : "package";
							server.getLiveSyncUrl(urlKind, def.relativePath, buildResult.buildProperties.LiveSyncToken,
								function(err, liveSyncUrl) {
									def.qrUrl = helpers.createQrUrl(liveSyncUrl);

									log.debug("QR URL is '%s'", def.qrUrl);
									callback(err, def);
								});
						},
						function(err, results) {
							if (err) {
								throw err;
							}

							showPackageQRCodes(results);
						}
					);
				}

				if (downloadFiles) {
					async.each(packageDefs, function(pkg, callback) {
						var filesystemPath = pkg.filesystemPath;
						var targetFileName = path.join(getTempDir(), path.basename(filesystemPath));
						server.downloadFile(filesystemPath, targetFileName, function(err) {
							if (err) {
								callback(err);
							} else {
								log.info("Download completed: %s", targetFileName);
								pkg.localFile = targetFileName;
								callback();
							}
						});
					}, function(err) {
						if (err) {
							throw err;
						}
						if (callback) {
							callback(null, packageDefs);
						}
					});
				} else {
					if (callback) {
						callback(null, packageDefs);
					}
				}
			});
		});
	}

	function buildCommand(platform, configuration) {
		build(platform, configuration, true, options.download);
	}

	function deployToIon() {
		log.info("Deploying to Ion");

		importProject(function(err) {
			if (err) {
				throw err;
			}

			server.getLiveSyncToken(projectData.name, projectData.name, config.SOLUTION_SPACE_NAME, function(err, liveSyncToken) {
				if (err) {
					throw err;
				}

				var hostPart = util.format("%s://%s", config.ICE_SERVER_PROTO, config.ICE_SERVER);
				var fullDownloadPath = util.format("icenium://%s?LiveSyncToken=%s", querystring.escape(hostPart), querystring.escape(liveSyncToken));

				log.debug("Using LiveSync URL for Ion: %s", fullDownloadPath);

				showPackageQRCodes([{
					platform: "Ion",
					qrUrl: helpers.createQrUrl(fullDownloadPath),
				}]);
			});
		});
	}

	function deployToDevice(platform, configuration) {
		devicesService.hasDevices(platform)
			.then(function(hasDevices) {
				if (hasDevices) {
					build(platform, configuration, false, true, function(err, packageDefs) {
						if (err) {
							throw err;
						}
						var packageFile = packageDefs[0].localFile;

						log.debug("Ready to deploy %s", packageDefs);
						log.debug("File is %d bytes", fs.statSync(packageFile).size);

						if(helpers.isiOSPlatform(platform)) {
							identity.findProvision(options.provision, function(error, identData){
								var provisionedDevices = identData.ProvisionedDevices.$values;
								processDeployToDevice(platform, packageFile, provisionedDevices);
							});
						}
						else {
							processDeployToDevice(platform, packageFile);
						}
					});
				} else {
					log.error(util.format("The app cannot be deployed because there are 0 connected %s devices", platform || ""));
				}
			})
			.done();
	}

	function processDeployToDevice(platform, packageFile, provisionedDevices){
		var packageName = getProjectData().AppIdentifier;
		devicesService.deploy(platform, packageFile, packageName, provisionedDevices)
			.then(function () {
				console.log(util.format("%s has been successfully installed on all connected %s devices", packageFile, platform));
			})
			.catch(function (error) {
				log.trace(error);
			})
			.done();
	}

	function importProject(callback) {
		var projectDir = getProjectDir();
		if (!projectDir) {
			log.fatal("Found nothing to import.");
			return;
		}

		zipProject(function(err, result) {
			if (err) {
				throw err;
			}
			log.debug("zipping completed, result file size: %d", fs.statSync(result.output).size);

			server.importProject(projectData.name, projectData.name, config.SOLUTION_SPACE_NAME, result.output,
				function(err) {
					log.trace("Project imported");
					if (callback) {
						callback(err);
					} else {
						if (err !== null) {
							throw err;
						}
					}
				});
		});
	}

	function saveProject(callback) {
		fs.writeFile(path.join(getProjectDir(), config.PROJECT_FILE_NAME), JSON.stringify(projectData, null, "\t"), function(err) {
			if (callback) {
				callback(err);
			} else if (err) {
				throw err;
			}
		});
	}

	function getProjectData() {
		projectData = JSON.parse(fs.readFileSync(path.join(getProjectDir(), config.PROJECT_FILE_NAME)));
		return projectData;
	}

	function createNewProject(projectName) {
		var projectDir = getNewProjectDir();

		if (projectName === undefined) {
			createProjectName(projectDir)
				.then(function(name) {
					return createFromTemplate(name, projectDir);
				})
				.done();
		} else {
			createFromTemplate(projectName);
		}
	}

	function createProjectName(projectDir) {
		return Q.ninvoke(fs, "readdir", projectDir)
			.then(function(files) {
				var defaultProjectName = config.DEFAULT_PROJECT_NAME;
				var count = _.filter(files, function(file) {
					return file.startsWith(defaultProjectName);
				}).length;

				if (count === 0) {
					return defaultProjectName;
				} else {
					return util.format("%s_%s", defaultProjectName, count);
				}
			});
	}

	function createFromTemplate(appname, projectDir) {
		var templatesDir = path.join(__dirname, "../resources/templates"),
			template = options.template || config.DEFAULT_PROJECT_TEMPLATE,
			templateFileName;

		if (appname === undefined) {
			log.fatal("At least appname must be specified!");
			return;
		}
		projectDir = path.join(projectDir, appname);

		if (options.appid === undefined) {
			options.appid = generateDefaultAppId(appname);
			log.warn("--appid was not specified. Defaulting to " + options.appid);
		}

		templateFileName = path.join(templatesDir, "Telerik.Mobile.Cordova." + template + ".zip");
		if (fs.existsSync(templateFileName)) {
			createProjectFile(projectDir, appname, {AppIdentifier: options.appid})
				.then(function() {
					return extractTemplate(templateFileName, projectDir);
				})
				.then(function() {
					console.log(util.format("%s has been successfully created.", appname));
				})
				.catch(function(error) {
					log.fatal(error.message);
				})
				.done();
		} else {
			log.fatal("The requested template " + options.template + " does not exist.");
			log.fatal("Available templates are:");
			config.TEMPLATE_NAMES.forEach(function(item) {
				log.fatal(item);
			});
		}
	}

	function getNewProjectDir() {
		return options.path || process.cwd();
	}

	function createProjectFile(projectDir, projectName, properties) {
		return helpers.makeDirIfNotAvailable(projectDir)
			.then(function() {
				return helpers.isEmptyDir(projectDir);
			})
			.then(function(isProjectDirEmpty) {
				if (!isProjectDirEmpty) {
					throw new Error("The specified directory must be empty to create a new project.");
				}
			})
			.then(function() {
				return setProjectData(projectDir, projectName, properties);
			});
	}

	function extractTemplate(templateFileName, projectDir) {
		var defered = Q.defer();
		fs.createReadStream(templateFileName)
			.pipe(unzip.Extract({ path: projectDir}))
			.on("close", function() {
				defered.resolve();
			})
			.on("error", function(error) {
				defered.reject(error);
			});
		return defered.promise;
	}

	function setProjectData(projectDir, appName, properties) {
		properties = typeof properties !== "undefined" ? properties : {};

		cachedProjectDir = projectDir;
		projectData = JSON.parse(fs.readFileSync(path.join(__dirname, "../resources/default-project.json")));
		projectData.name = appName;
		projectData.iOSDisplayName = appName;
		projectData.AppIdentifier = properties.AppIdentifier || generateDefaultAppId(appName);
		projectData.ProjectGuid = properties.ProjectGuid || generateProjectGuid();
		projectData.BundleVersion = properties.BundleVersion || projectData.BundleVersion;
		projectData.CorePlugins = typeof properties.CorePlugins !== "undefined" ? properties.CorePlugins.split(";") : projectData.CorePlugins;
		projectData.DeviceOrientations = properties.DeviceOrientations || projectData.DeviceOrientations;
		projectData.FrameworkVersion = properties.FrameworkVersion || projectData.FrameworkVersion;
		projectData.iOSStatusBarStyle = properties.iOSStatusBarStyle || projectData.iOSStatusBarStyle;
		projectData.AndroidPermissions =
			typeof properties.AndroidPermissions !== "undefined" ? properties.AndroidPermissions.split(";") : projectData.AndroidPermissions;
		return Q.ninvoke(saveProject);
	}

	function generateDefaultAppId(appName) {
		return "com.telerik." + appName;
	}

	function generateProjectGuid() {
		/* jshint -W016 */
		var genUUIDv4 = function b(a) { return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,b); };
		return genUUIDv4();
		/* jshint +W016 */
	}

	function isProjectFileExcluded(projectDir, filePath, excludedDirsAndFiles) {
		var relativeToProjectPath = filePath.substr(projectDir.length + 1);
		var lowerCasePath = relativeToProjectPath.toLowerCase();
		for (var key in excludedDirsAndFiles) {
			if (lowerCasePath.startsWith(excludedDirsAndFiles[key])) {
				return true;
			}
		}
		return false;
	}

	function normalizePropertyName(property) {
		if (!property) {
			return property;
		}

		var propSchema = helpers.getProjectFileSchema();
		var propLookup = helpers.toHash(propSchema,
			function(value, key) { return key.toLowerCase(); },
			function(value, key) { return key; });
		return propLookup[property.toLowerCase()] || property;
	}

	function updateProjectProperty(projectData, mode, property, newValue) {
		property = normalizePropertyName(property);
		var propSchema = helpers.getProjectFileSchema();
		var propData = propSchema[property];

		if (!propData) {
			log.fatal("Unrecognized property '%s'", property);
			printProjectSchemaHelp();
			return;
		}

		if (!propData.flags) {
			if (newValue.length !== 1) {
				helpers.abort("Property '%s' is not a collection of flags. Specify only a single property value.", property);
			}
			if (mode === "add" || mode === "del") {
				helpers.abort("Property '%s' is not a collection of flags. Use prop-set to set a property value.", property);
			}
		} else {
			newValue = _.flatten(_.map(newValue, function(value) { return value.split(";"); }));
		}

		var range = propData.range;
		if (range) {
			newValue = _.map(newValue, function(value) { return value.toLowerCase(); });

			var validValues;
			if (_.isArray(range)) {
				validValues = helpers.toHash(range,
					function(value) { return value.toLowerCase(); },
					_.identity);

			} else {
				validValues = helpers.toHash(range,
					function(value, key) { return (value.input || key).toLowerCase(); },
					function(value, key) { return key; });
			}

			var badValues = _.reject(newValue, function(value) {
				return validValues[value];
			});
			if (badValues.length > 0) {
				helpers.abort("Invalid property value%s: %s", badValues.length > 1 ? "s" : "", badValues.join("; "));
			}

			newValue = _.map(newValue, function(value) { return validValues[value]; });
		}

		if (!propData.flags) {
			newValue = newValue[0];

			if (propData.regex) {
				var matchRegex = new RegExp(propData.regex);
				if (!matchRegex.test(newValue)) {
					helpers.abort("Value '%s' is not in the format expected by property %s. Expected to match /%s/", newValue, property, propData.regex);
				}
			}
		}

		var propertyValue = projectData[property];
		if (propData.flags && _.isString(propertyValue)) {
			propertyValue = propertyValue.split(";");
		}

		if (mode === "set") {
			propertyValue = newValue;
		} else if (mode === "del") {
			propertyValue = _.difference(propertyValue, newValue);
		} else if (mode === "add") {
			propertyValue = _.union(propertyValue, newValue);
		} else {
			helpers.abort("Unknown property update mode '%s'", mode);
		}

		if (propertyValue.sort) {
			propertyValue.sort();
		}

		projectData[property] = propertyValue;
	}

	function updateProjectPropertyAndSave(mode, args) {
		ensureProject();

		updateProjectProperty(projectData, mode, args[0], _.rest(args, 1));
		saveProject();
	}

	function setProjectProperty() {
		updateProjectPropertyAndSave("set", _.toArray(arguments));
	}

	function addProjectProperty() {
		updateProjectPropertyAndSave("add", _.toArray(arguments));
	}

	function delProjectProperty() {
		updateProjectPropertyAndSave("del", _.toArray(arguments));
	}

	function printProjectProperty(property) {
		ensureProject();
		property = normalizePropertyName(property);

		if (projectData[property]) {
			console.log(projectData[property]);
		} else {
			log.fatal("Unrecognized property '%s'", property);
			printProjectSchemaHelp();
		}
	}

	function printProjectSchemaHelp() {
		var schema = helpers.getProjectFileSchema();
		log.info("Project properties:");
		_.each(schema, function(value, key) {
			log.info(util.format("  %s - %s", key, value.description));
			if (value.range) {
				log.info("    Valid values:");
				_.each(value.range, function(rangeDesc, rangeKey) {
					var desc = "      " + (_.isArray(value.range) ? rangeDesc : rangeDesc.input || rangeKey);
					if (rangeDesc.description) {
						desc += " - " + rangeDesc.description;
					}
					log.info(desc);
				});
			}
			if (value.regex) {
				log.info("    Valid values match /" + value.regex.toString() + "/");
			}
		});
	}

	function ensureProject() {
		if (!projectData) {
			helpers.abort("Not in a project folder.");
		}
	}

	if (getProjectDir()) {
		try {
			projectData = JSON.parse(fs.readFileSync(path.join(getProjectDir(), config.PROJECT_FILE_NAME)));
		} catch(err) {
			log.fatal("There was a problem reading the project file. " + err);
			process.exit(1);
		}
	}

	exports.hasProject = hasProject;
	exports.getProjectDir = getProjectDir;
	exports.project = projectData;
	exports.buildCommand = buildCommand;
	exports.saveProject = saveProject;
	exports.importProject = importProject;
	exports.deployToIon = deployToIon;
	exports.deployToDevice = deployToDevice;
	exports.createNewProject = createNewProject;
	exports.enumerateProjectFiles = enumerateProjectFiles;
	exports.isProjectFileExcluded = isProjectFileExcluded;
	exports.updateProjectProperty = updateProjectProperty;
	exports.setProjectProperty = setProjectProperty;
	exports.addProjectProperty = addProjectProperty;
	exports.delProjectProperty = delProjectProperty;
	exports.printProjectProperty = printProjectProperty;
	exports.ensureProject = ensureProject;
	exports.createProjectFile = createProjectFile;
})();