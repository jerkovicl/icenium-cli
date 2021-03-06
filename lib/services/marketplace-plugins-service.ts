///<reference path="../.d.ts"/>
"use strict";

import util = require("util");
import PluginsDataLib = require("./../plugins-data");

export class MarketplacePluginsService implements ICordovaPluginsService {
	private static MARKET_PLACE_PLUGINS_URL = "https://plugins.telerik.com/api/plugins";

	constructor(private $httpClient: Server.IHttpClient,
		private $server: Server.IServer,
		private $project: Project.IProject,
		private $projectConstants: Project.IProjectConstants) { }

	public getAvailablePlugins(): IFuture<any> {
		return (() => {
			return JSON.parse(this.$httpClient.httpRequest(MarketplacePluginsService.MARKET_PLACE_PLUGINS_URL).wait().body);
		}).future<any>()();
	}

	public createPluginData(plugin: any): IFuture<IMarketplacePlugin> {
		return (() => {
			var rowPluginData = this.$server.cordova.getMarketplacePluginData(plugin.uniqueId, plugin.pluginVersion).wait();
			if(!rowPluginData.Url) {
				rowPluginData.Url = plugin.repositoryUrl;
			}
			return new PluginsDataLib.MarketplacePluginData(rowPluginData, plugin.downloadsCount, plugin.demoAppRepositoryLink, plugin.publisher, this.$project, this.$projectConstants);
		}).future<IMarketplacePlugin>()();
	}
}
$injector.register("marketplacePluginsService", MarketplacePluginsService);