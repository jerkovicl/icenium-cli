interface ISchema {
	$schema: string;
	id: string;
	type: string;
	additionalProperties: boolean;
	properties: IDictionary<any>;
	required?: boolean;
	extends?: any
}

interface ISchemaExtends {
	"$ref": string;
	properties?: any;
}

interface IJsonSchemaLoader { }

interface IJsonSchemaResolver {
	getSchema(schemaId: string): ISchema;
}

interface IJsonSchemaValidator {
	validProperties: IStringDictionary;
	validate(data: IProjectData): any;
	isValid(data: IProjectData): boolean;
}