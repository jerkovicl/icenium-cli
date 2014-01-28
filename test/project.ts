///<reference path=".d.ts"/>

"use strict";

var assert = require("chai").assert;
import fs = require("fs");
import path = require("path");
import temp = require("temp");
temp.track();

describe("project", function() {
	var project = require("./../lib/project");

	before(function (done) {
		$injector.require("fs", "./file-system");
		done();
	});

	describe("createNewProject", function () {
		it("creates a valid project folder", function () {
			var options: any = require("./../lib/options");
			var tempFolder = temp.mkdirSync("template");
			var projectName = "Test";

			options.path = tempFolder;
			options.template = "Blank";
			options.appid = "com.telerik.Test";

			project.createNewProject(projectName);

			var abProject = fs.readFileSync(path.join(tempFolder, projectName, ".abproject"));
			var correctABProject = fs.readFileSync(path.join(__dirname, "/resources/blank.abproject"));
			var testProperties = JSON.parse(abProject.toString());
			var correctProperties = JSON.parse(correctABProject.toString());

			assert.deepEqual(Object.keys(testProperties), Object.keys(correctProperties));
			for (var key in testProperties) {
				if (key != "ProjectGuid") {
					assert.deepEqual(testProperties[key], correctProperties[key]);
				}
			}
		});
	});

	describe("createTemplateFolder", function () {
		it("creates project folder when folder with that name doesn't exists", function () {
			var tempFolder = temp.mkdirSync("template");
			var projectName = "Test";
			var projectFolder = path.join(tempFolder, projectName);

			project.createTemplateFolder(projectFolder).wait();
			assert.isTrue(fs.existsSync(projectFolder));
		});

		it("doesn't fail when folder with that name exists and it's empty", function () {
			var tempFolder = temp.mkdirSync("template");
			var projectName = "Test";
			var projectFolder = path.join(tempFolder, projectName);

			fs.mkdirSync(projectFolder);
			project.createTemplateFolder(projectFolder).wait();
			assert.isTrue(fs.existsSync(projectFolder));
		});

		it("fails when project folder is not empty", function () {
			var tempFolder = temp.mkdirSync("template");
			var projectName = "Test";
			var projectFolder = path.join(tempFolder, projectName);

			fs.mkdirSync(projectFolder);
			fs.openSync(path.join(projectFolder, "temp"), "a", "0666");
			assert.throws(function () { project.createTemplateFolder(projectFolder).wait(); });
		});
	});

	describe("updateProjectProperty", function() {
		it("sets unconstrained string property", function() {
			var projectData = {name: "wrong"};
			project.updateProjectProperty(projectData, "set", "name", ["fine"]);
			assert.equal("fine", projectData.name);
		});

		it("disallows 'add' on non-flag property", function() {
			var projectData = {name: "wrong"};
			assert.throws(function() {project.updateProjectProperty(projectData, "add", "name", ["fine"]);});
		});

		it("disallows 'del' on non-flag property", function() {
			var projectData = {name: "wrong"};
			assert.throws(function() {project.updateProjectProperty(projectData, "del", "name", ["fine"]);});
		});

		it("sets bundle version when given proper input", function() {
			var projectData = {"BundleVersion": "0"};
			project.updateProjectProperty(projectData, "set", "BundleVersion", ["10.20.30"]);
			assert.equal("10.20.30", projectData.BundleVersion);
		});

		it("throws on invalid bundle version string", function() {
			var projectData = {"BundleVersion": "0"};
			assert.throws(function() {project.updateProjectProperty(projectData, "set", "BundleVersion", ["10.20.30c"]);});
		});

		it("sets enumerated property", function() {
			var projectData = {iOSStatusBarStyle: "Default"};
			project.updateProjectProperty(projectData, "set", "iOSStatusBarStyle", ["Hidden"]);
			assert.equal("Hidden", projectData.iOSStatusBarStyle);
		});

		it("disallows unrecognized values for enumerated property", function() {
			var projectData = {iOSStatusBarStyle: "Default"};
			assert.throws(function() {project.updateProjectProperty(projectData, "set", "iOSStatusBarStyle", ["does not exist"]);});
		});

		it("appends to verbatim enumerated collection property", function() {
			var projectData = {DeviceOrientations: []};
			project.updateProjectProperty(projectData, "add", "DeviceOrientations", ["Portrait"]);
			assert.deepEqual(["Portrait"], projectData.DeviceOrientations);
			project.updateProjectProperty(projectData, "add", "DeviceOrientations", ["Landscape"]);
			assert.deepEqual(["Landscape", "Portrait"], projectData.DeviceOrientations);
		});

		it("appends to enumerated collection property with shorthand", function() {
			var projectData = {iOSDeviceFamily: []};
			project.updateProjectProperty(projectData, "add", "iOSDeviceFamily", ["iPhone"]);
			assert.deepEqual(["1"], projectData.iOSDeviceFamily);
			project.updateProjectProperty(projectData, "add", "iOSDeviceFamily", ["iPad"]);
			assert.deepEqual(["1", "2"], projectData.iOSDeviceFamily);
		});

		it("appends multiple values to enumerated collection property", function() {
			var projectData = {iOSDeviceFamily: []};
			project.updateProjectProperty(projectData, "add", "iOSDeviceFamily", ["iPhone", "iPad"]);
			assert.deepEqual(["1", "2"], projectData.iOSDeviceFamily);
		});

		it("removes from enumerated collection property", function() {
			var projectData = {DeviceOrientations: ["Landscape", "Portrait"]};
			project.updateProjectProperty(projectData, "del", "DeviceOrientations", ["Portrait"]);
			assert.deepEqual(["Landscape"], projectData.DeviceOrientations);
			project.updateProjectProperty(projectData, "del", "DeviceOrientations", ["Portrait"]);
			assert.deepEqual(["Landscape"], projectData.DeviceOrientations);
		});

		it("disallows unrecognized values for enumerated collection property", function() {
			var projectData = {DeviceOrientations: []};
			assert.throws(function() {project.updateProjectProperty(projectData, "add", "DeviceOrientations", ["Landscape", "bar"]);});
		});

		it("makes case-insensitive comparisons of property name", function() {
			var projectData = {DeviceOrientations: []};
			project.updateProjectProperty(projectData, "add", "deviceorientations", ["Landscape"]);
			assert.deepEqual(["Landscape"], projectData.DeviceOrientations);
		});

		it("makes case-insensitive comparisons of property values", function() {
			var projectData = {DeviceOrientations: []};
			project.updateProjectProperty(projectData, "add", "DeviceOrientations", ["landscape"]);
			assert.deepEqual(["Landscape"], projectData.DeviceOrientations);
		});
	});
});
