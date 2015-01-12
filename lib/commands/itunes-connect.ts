///<reference path="../.d.ts"/>

"use strict";

import constants = require("../common/mobile/constants");
import commandParams = require("../common/command-params");
var options: any = require("../options");

export class AppstoreApplicationCommandBase implements ICommand {
	constructor(public $server: Server.IServer,
		public $logger: ILogger,
		public $prompter: IPrompter,
		public $errors: IErrors) { }

	execute(args: string[]): IFuture<void> {
		return (() => {
		}).future<void>()();
	}

	allowedParameters: ICommandParameter[] = [];

	public getAppleId(): IFuture<string> {
		return (() => {
			var appleIdSchema: IPromptSchema = {
				properties: {
					appleId: {
						description: "Apple ID",
						type: "string",
						hidden: false,
						required: true,
						message: "Apple ID must be non-empty."
					}
				}
			};

			var result = this.$prompter.get(appleIdSchema).wait();
			return result["appleId"];
		}).future<string>()();
	}
}

export class ListApplicationsReadyForUploadCommand extends AppstoreApplicationCommandBase {
	constructor(public $server: Server.IServer,
		public $logger: ILogger,
		public $prompter: IPrompter,
		public $errors: IErrors,
		private $loginManager: ILoginManager) {
		super($server, $logger, $prompter, $errors);
	}

    allowedParameters = [new commandParams.StringCommandParameter(), new commandParams.StringCommandParameter()];
	
    execute(args: string[]): IFuture<void> {
		return (() => {
			this.$loginManager.ensureLoggedIn().wait();

			var userName = args[0];
			var password = args[1];

			if(!userName) {
				userName = this.getAppleId().wait();
			}

			if(!password) {
				password = this.$prompter.getPassword("Apple ID password").wait();
			}

			var apps = this.$server.itmstransporter.getApplicationsReadyForUpload(userName, password).wait();
			apps = _.sortBy(apps, (app: Server.Application) => app.Application);

			apps.forEach((app:Server.Application) => {
				this.$logger.out("%s %s (%s)", app.Application, (<any>app)["Version Number"], app.ReservedBundleIdentifier);
			});

			if(!apps.length) {
				this.$logger.out("No applications are ready for upload.");
			}
		}).future<void>()();
	}
}
$injector.registerCommand("appstore|list", ListApplicationsReadyForUploadCommand);

export class UploadApplicationCommand extends AppstoreApplicationCommandBase {
	constructor(public $server: Server.IServer,
		public $logger: ILogger,
		public $errors: IErrors,
		public $prompter: IPrompter,
		private $project: Project.IProject,
		private $buildService: Project.IBuildService,
		private $identityManager: Server.IIdentityManager,
		private $stringParameterBuilder: IStringParameterBuilder,
		private $loginManager: ILoginManager) {
		super($server, $logger, $prompter, $errors);
	}
    
	allowedParameters = [this.$stringParameterBuilder.createMandatoryParameter("No application specified. Specify an application that is ready for upload in iTunes Connect."),
		new commandParams.StringCommandParameter(), new commandParams.StringCommandParameter()];
        
	execute(args:string[]): IFuture<void> {
		return (() => {
			this.$project.ensureProject();
			this.$loginManager.ensureLoggedIn().wait();

			var application = args[0];
			var userName = args[1];
			var password = args[2];
			if(!application) {
				this.$errors.fail("No application specified. Specify an application that is ready for upload in iTunes Connect.");
			}

			if(!userName) {
				userName = this.getAppleId().wait();
			}

			if(options.provision) {
				this.$logger.info("Checking provision.");
				var provision = this.$identityManager.findProvision(options.provision).wait();

				if(provision.ProvisionType !== constants.ProvisionType.AppStore) {
					this.$errors.fail("Provision '%s' is of type '%s'. It must be of type AppStore in order to publish your app.",
						provision.Name, provision.ProvisionType);
				}
			}

			if(!password) {
				password = this.$prompter.getPassword("Apple ID password").wait();
			}

			this.$logger.info("Checking that iTunes Connect application is ready for upload.");
			var apps = this.$server.itmstransporter.getApplicationsReadyForUpload(userName, password).wait();
			var theApp = _.find(apps, (app: Server.Application) => app.Application === application);
			if(!theApp) {
				this.$errors.fail("App '%s' does not exist or is not ready for upload.", application);
			}

			this.$logger.info("Building release package.");
			var buildResult = this.$buildService.build({
				platform: "iOS",
				configuration: "Release",
				provisionTypes: [constants.ProvisionType.AppStore]
			}).wait();
			if(!buildResult[0] || !buildResult[0].solutionPath) {
				this.$errors.fail({ formatStr: "Build failed.", suppressCommandHelp: true });
			}

			this.$logger.info("Uploading package to iTunes Connect. This may take several minutes.");
			var solutionPath = buildResult[0].solutionPath;
			var projectPath = solutionPath.substr(solutionPath.indexOf("/") + 1);

			var projectData = this.$project.projectData;
			this.$server.itmstransporter.uploadApplication(projectData.ProjectName, projectData.ProjectName,
				projectPath, theApp.AppleID, userName, password).wait();

			this.$logger.info("Upload complete.")
		}).future<void>()();
	}
}
$injector.registerCommand("appstore|upload", UploadApplicationCommand);
