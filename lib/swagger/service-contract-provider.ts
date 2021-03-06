///<reference path="../.d.ts"/>
"use strict";

export class ServiceContractProvider implements Server.IServiceContractProvider {
	constructor(private $httpClient: Server.IHttpClient,
				private $config: IConfiguration) {
	}

	getApi(path?: string): IFuture<Swagger.ISwaggerServiceContract> {
		return (() => {
			var request:any = {
				proto: this.$config.AB_SERVER_PROTO,
				host: this.$config.AB_SERVER,
				path: "/appbuilder/api/swagger",
				method: "GET"
			};

			if (path) {
				request.path += path;
			}

			var result = this.$httpClient.httpRequest(request).wait();
			if (result.error) {
				throw result.error;
			} else {
				return JSON.parse(result.body);
			}

		}).future<Swagger.ISwaggerServiceContract>()();
	}
}
$injector.register("serviceContractProvider", ServiceContractProvider);
