///<reference path="./../.d.ts"/>
"use strict";

import helpers = require("./../helpers");

export class FrameworkProjectBase implements Project.IFrameworkProjectBase {
	constructor(private $resources: IResourceLoader) { 	}

	public projectTemplatesString(regex: RegExp): string {
		var projectTemplatesDir = this.$resources.resolvePath("ProjectTemplates");
		var templates = _.map(this.$fs.readDirectory(projectTemplatesDir).wait(), (file) => {
			var match = file.match(regex);
			return match && match[1];
		})
			.filter((file: string) => file !== null);
		return helpers.formatListOfNames(templates);
	}
}