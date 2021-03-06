///<reference path="../.d.ts"/>
"use strict";
import os = require("os");
import minimatch = require("minimatch");

export class PathFilteringService implements IPathFilteringService {

	constructor(private $fs: IFileSystem) {	}

	public getRulesFromFile(fullFilePath: string) : string[] {
		var COMMENT_START = '#';
		var rules: string[] = [];

		try {
			var fileContent = this.$fs.readText(fullFilePath).wait();
			rules = _.reject(fileContent.split(/[\n\r]/),
				(line: string) => line.length === 0 || line[0] === COMMENT_START);

		} catch(e) {
			if (e.code !== "ENOENT") { // file not found
				throw e;
			}
		}

		return rules;
	}

	public filterIgnoredFiles(files: string[], rules: string[], rootDir: string): string[]{
		return _.reject(files, file => this.isFileExcluded(file, rules, rootDir));
	}

	public isFileExcluded(file: string, rules: string[], rootDir: string): boolean {
		file = file.replace(rootDir, "").replace(new RegExp("^[\\\\|/]*"), "");
		var fileMatched = true;
		_.each(rules, rule => {
			// minimatch treats starting '!' as pattern negation
			// but we want the pattern matched and then do something else with the file
			// therefore, we manually handle leading ! and \! and hide them from minimatch
			var shouldInclude = rule[0] === '!';
			if (shouldInclude) {
				rule = rule.substr(1);
				var ruleMatched = minimatch(file, rule, {nocase: true});
				if (ruleMatched) {
					fileMatched = true;
				}
			} else {
				var options = {nocase: true, nonegate: false};
				if (rule[0] === '\\' && rule[1] === '!') {
					rule = rule.substr(1);
					options.nonegate = true;
				}
				var ruleMatched = minimatch(file, rule, options);
				fileMatched = fileMatched && !ruleMatched;
			}
		});

		return !fileMatched;
	}
}

$injector.register("pathFilteringService", PathFilteringService);
