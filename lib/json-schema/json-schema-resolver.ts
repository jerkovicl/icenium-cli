///<reference path="../.d.ts"/>
"use strict";

import util = require("util");

export class JsonSchemaResolver implements IJsonSchemaResolver {
	private schema: ISchema = null;

	constructor(private schemas: ISchema[],
		private $errors: IErrors) { }

	public getSchema(schemaId: string): ISchema {
		if(!this.schema) {
			this.schema = this.findSchema(schemaId);

			if(!this.schema) {
				this.$errors.fail("Unable to find schema with id %s.", schemaId);
			}

			var extendsProperty = this.schema.extends;
			if(extendsProperty) {
				this.schema.extends = {};
				this.schema.extends.properties = Object.create(null);

				this.buildValidationSchema(extendsProperty);
			}
		}

		return this.schema;
	}

	private buildValidationSchema(extendsProperty: ISchemaExtends[]) {
		_.each(extendsProperty, (ext: ISchemaExtends) => {
			var refSchema = this.findSchema(ext.$ref);
			if(refSchema && refSchema.properties) {
				_.extend(this.schema.extends.properties, refSchema.properties);
			}
			if(refSchema.extends) {
				this.buildValidationSchema(refSchema.extends);
			}
		});
	}

	private buildSchemaIdRegex(schemaId: string) {
		return util.format("^%s$", schemaId.replace("\?", ".").replace("\*", ".*"));
	}

	private findSchema(schemaId: string): ISchema {
		return _.find(this.schemas, (s: ISchema) => s.id === schemaId);
	}
}