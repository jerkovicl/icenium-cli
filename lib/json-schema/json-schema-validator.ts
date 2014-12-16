///<reference path="../.d.ts"/>
"use strict";

import util = require("util");

var jsv = require("jsv").JSV;

export class JsonSchemaValidator implements IJsonSchemaValidator {
	private static ENVIRONMENT_ID = "json-schema-draft-03";
	private static DEFAULT_SCHEMA_URI = "http://json-schema.org/draft-03/schema#";

	private environment: any = null;

	constructor(private $jsonSchemaLoader: IJsonSchemaLoader,
		private $jsonSchemaResolver: IJsonSchemaResolver,
		private $errors: IErrors) {
		this.environment = jsv.createEnvironment(JsonSchemaValidator.ENVIRONMENT_ID);
		this.environment.setDefaultSchemaURI(JsonSchemaValidator.DEFAULT_SCHEMA_URI);
	}

	public validate(data: IProjectData): void {
		var schema = this.environment.createSchema(this.tryResolveValidationSchema());
		this.environment.validate(data, schema);
	}

	private tryResolveValidationSchema(): ISchema {
		var schema = this.$jsonSchemaResolver.getSchema("Cordova-3.*");

		if(!schema) {
			this.$errors.fail("Unbale to resolve validation schema.");
		}

		return schema;
	}
}
$injector.register("jsonSchemaValidator", JsonSchemaValidator);