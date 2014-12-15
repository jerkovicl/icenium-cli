///<reference path="../.d.ts"/>
"use strict";

export class JsonSchemaResolver implements IJsonSchemaResolver {
	public loadedSchemas: string[] = null;

	constructor() {
		this.loadedSchemas = [];
	}

	public isSchemaLoaded(schemaId: string): boolean {
		return _.contains(this.loadedSchemas, schemaId);
	}
}
$injector.register("jsonSchemaResolver", JsonSchemaResolver);