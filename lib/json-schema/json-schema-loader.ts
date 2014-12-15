///<reference path="../.d.ts"/>
"use strict";

import path = require("path");

var jsv = require("jsv").JSV;

export class JsonSchemaLoader implements IJsonSchemaLoader {
	private schemasFolderPath: string = null;
	private schemas: ISchema[] = null;

	public constructor(private $fs: IFileSystem,
		private $errors: IErrors,
		private $jsonSchemaResolver: IJsonSchemaResolver) {
		this.schemasFolderPath = path.join(__dirname, "../../", "resources", "json-schemas");
		this.schemas = [];
	}

	public loadSchemas(): IFuture<void> {
		return (() => {
			var schemasDirectoryContent = this.$fs.readDirectory(this.schemasFolderPath).wait();
			this.schemas = <ISchema[]>_.chain(schemasDirectoryContent)
				.filter((filePath: string) => path.extname(filePath) === ".json")
				.map((filePath: string) => this.$fs.readJson(filePath).wait())
				.values();

			_.each(this.schemas, (schema: ISchema) => this.loadSchema(schema).wait());

		}).future<void>()();
	}

	private loadSchema(schema: ISchema): IFuture<void> {
		return (() => {
			var id = schema.id;
			var extendsProperty = schema.extends;

			if(!this.$jsonSchemaResolver.isSchemaLoaded(id)) {
				if(extendsProperty && extendsProperty.length > 0) {
					_.each(extendsProperty, (ext: ISchemaExtends) => {
						var schemaRef = ext.$ref;
						var extSchema = this.findSchema(schemaRef);

						if(extSchema == null) {
							this.$errors.fail("Schema %s not found.", schemaRef);
						}

						this.loadSchema(extSchema);
					});
				}

				this.$jsonSchemaResolver.loadedSchemas.push(id);
			}
		}).future<void>()();
	}

	private findSchema(schemaId: string): ISchema {
		return _.find(this.schemas, (schema: ISchema) => schema.id === schemaId);
	}
}
$injector.register("jsonSchemaLoader", JsonSchemaLoader);