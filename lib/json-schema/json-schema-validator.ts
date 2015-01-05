///<reference path="../.d.ts"/>
"use strict";

import util = require("util");

var jsv = require("jsv").JSV;

export class JsonSchemaValidator implements IJsonSchemaValidator {
	private static ENVIRONMENT_ID = "json-schema-draft-03";
	private static DEFAULT_SCHEMA_URI = "http://json-schema.org/draft-03/schema#";

	private environment: any = null;
	private _validProperties: IStringDictionary = null;

	constructor(private $jsonSchemaLoader: IJsonSchemaLoader,
		private $jsonSchemaResolver: IJsonSchemaResolver,
		private $errors: IErrors) {
		this.environment = jsv.createEnvironment(JsonSchemaValidator.ENVIRONMENT_ID);
		this.environment.setDefaultSchemaURI(JsonSchemaValidator.DEFAULT_SCHEMA_URI);
	}

	public get validProperties(): IStringDictionary {
		if(!this._validProperties) {
			this._validProperties = Object.create(null);
			var schema = this.tryResolveValidationSchema();
			var properties = _.union(_.keys(schema.properties), _.keys(schema.extends.properties));
			_.each(properties, (propertyName: string) => {
				this._validProperties[propertyName.toLowerCase()] = propertyName;
			});
		}

		return this._validProperties;
	}

	public validate(data: IProjectData): any {
		var schema = this.environment.createSchema(this.tryResolveValidationSchema());
		var errors = this.environment.validate(data, schema);
		//_.each(errors, (error: )
		// TODO: parse errors and show more user friendly messages
		return errors;
	}

	public isValid(data: IProjectData): boolean {
		var errors = this.validate(data);
		return errors.length !== 0;
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