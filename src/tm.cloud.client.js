angular.module('tmCloudClient', [
		'ngStorage',
		'tmCloudClientAuth',
		'tmCloudClientUser',
		'tmCloudClientOrganization',
		'tmCloudClientNetwork',
		'tmCloudClientChannels',
		'tmCloudClientDevice',
		'tmCloudClientMessage'
//		, 'tmCloudClientStream'
	])
//	.value('endpoint', 'https://cloud.tiny-mesh.com')
	.value('endpoint', 'http://localhost:8080')
	.config(function($httpProvider) {
		$httpProvider.interceptors.push(function($q, tmCloud, $localStorage) {
			return {
				request: function(config, headers, a) {
					var sig, data, proc;

					// needed to ensure that the signed blob contains
					// same fields as the actual request
					if (config.preproc) {
						config.data = config.preproc(config.data);
					}

					data = config.data ? angular.toJson(config.data) : "";

					var url = "";
					for (var p in config.params) {
						url += "&" + p + "=" + encodeURI(config.params[p]);
					}

					url = config.url + ("" !== url ? "?" + url.substring(1) : "");

					if (sig = tmCloud.sign(config.method, url, data)) {
						config.headers['Authorization'] = $localStorage.fingerprint + " " + sig;
					}

					return config || $q.when(config);
				}
			};
		});
	})
	.service('tmCloud', function() {
		"use strict";

		var f = function() {
			var secret, obj;
			this.setSecret = function(newSecret) {
				secret = newSecret;
				return true;
			};
			this.sign = function(method, url, payload) {
				if (!secret) {
					return;
				}

				var buf = "";

				buf += method + "\n";
				buf += url + "\n";
				buf += payload;

				return CryptoJS.HmacSHA256(buf, secret).toString(CryptoJS.enc.Base64);
			};

			return this;
		};

		return new f();
	});

angular.module('tmCloudClientAuth', ['ngResource'])
	.factory('tmAuth', function($resource, endpoint) {
		return new $resource(endpoint + "/auth", {}, {});
	})
	.factory('tmAuthSession', function($http, $resource, $rootScope, $localStorage, tmCloud, endpoint, tmAuth) {
		"use strict";

		var impl, onAuth, onAuthDestroy;

		$localStorage.$default({
			authenticated: false,
			fingerprint: undefined,
			key: undefined,
			resources: []
		});

		onAuth = function(auth) {
			$localStorage.authenticated = true;
			$localStorage.owner = auth.owner;
			$localStorage.ttl= auth.ttl;
			$localStorage.fingerprint = auth.fingerprint;
			$localStorage.key = auth.key;
			$localStorage.resources = auth.resources;

			if (auth.key) {
				tmCloud.setSecret(auth.key);
			}

			$rootScope.$broadcast('session:new', {
				type:        auth.ttl,
				owner:       auth.owner,
				ttl:         auth.ttl,
				resources:   auth.resources,
				fingerprint: auth.fingerprint
			});
		};

		onAuthDestroy = function() {
			delete $localStorage.authenticated;
			delete $localStorage.fingerprint;
			delete $localStorage.key;
			delete $localStorage.resources;

			$rootScope.$broadcast('session:destroy');
		};

		impl = new $resource(endpoint + '/auth/session', {}, {
			create: {method: 'POST'},
			destroy: {method: 'DELETE'}
		});

		impl.login = function(user, pass) {
			var obj = {email: user, password: pass};
			return impl.create(obj).$promise.then(onAuth);
		}

		impl.logout = function() {
			return impl.destroy({}).$promise.then(onAuthDestroy);
		}

		impl.authenticated = function() {
			return $localStorage.authenticated;
		}

		impl.maybeAuthenticate = function(callback, errCallback) {
			if ($localStorage.authenticated) {
				tmCloud.setSecret($localStorage.key);
				tmAuth.get().$promise.then(
					callback || onAuth,
					errCallback || onAuthDestroy);
			} else if(errCallback) {
				errCallback();
			}
		};

		return impl;
	});

angular.module('tmCloudClientUser', ['ngResource'])
	.factory('tmUser', function($resource, endpoint) {
		return $resource(endpoint + '/user', {}, {
			get: {method: 'GET'},
			update: {
				method: 'PUT',
				preproc: function(data) {
					var newdata = angular.copy(data);
					delete newdata.organizations;
					delete newdata.networks;
					delete newdata.email;

					return newdata;
				}
			}
		});
	});
angular.module('tmCloudClientOrganization', ['ngResource'])
	.factory('tmOrganization', function($resource, endpoint) {
		return $resource(endpoint + '/organization/:key', {}, {
			list: {
				method: 'GET',
				isArray: true
			},
			get: {method: 'GET'},
			update: {method: 'PUT'},
		});
	})
	.factory('tmOrganizationUsers', function($resource, endpoint) {
		return $resource(endpoint + '/organization/:org/user/:user', {
				org: '@organization',
				user: '@user',
			}, {
			add: {method: 'PUT'},
			remove: {method: 'DELETE'},
		});
	});

angular.module('tmCloudClientNetwork', ['ngResource'])
	.factory('tmNet', function($resource, endpoint) {
		return $resource(endpoint + '/network/:id', {id: '@key'}, {
			list: {
				method: 'GET',
				isArray: true
			},
			create: {method: 'POST'},
			update: {method: 'PUT'},
			get: {method: 'GET'},
		});
	});

angular.module('tmCloudClientChannels', ['ngResource'])
	.factory('tmChannels', function($resource, $http, endpoint) {
		return $resource(endpoint + '/channels/:res', {res: '@key'}, {
			get: {method: 'GET'},
		});
	});
//
angular.module('tmCloudClientDevice', ['ngResource'])
	.factory('tmDevice', function($resource, endpoint, tmAuth) {
		return $resource(endpoint + '/device/:network/:id', {id: '@key'}, {
			create: {method: 'POST'},
			update: {method: 'PUT'},
			get: {method: 'GET'},
		});
	});
//		return $resource(endpoint + '/device/:network/:key', {key: '@key', network: '@network'}, {
//			create: {method: 'POST', transformRequest: function(data, headers) {
//				var url, omit = ['address', 'counters', 'devices', 'key', 'meta', 'tm/state', 'updated', 'last_message'];
//				url = '/device/'  + data.network;
//				data = angular.toJson(_.omit(data, omit));
//				data = angular.toJson(data);
//				return tmAuth.signReq('POST', url, data, headers);
//			}},
//			update: {method: 'PUT', transformRequest: function(data, headers) {
//				var url, omit = ['address', 'counters', 'devices', 'key', 'meta', 'tm/state', 'updated', 'last_message'];
//				url = '/device/'  + data.network + '/' + data.key;
//				data = angular.toJson(_.omit(data, omit));
//				return tmAuth.signReq('PUT', url, data, headers);
//			}},
//			get: {method: 'get', transformRequest: function(data, headers) {
//				var omit = ['address', 'counters', 'devices'];
//				data = angular.toJson(_.omit(data, omit));
//				return tmAuth.signReq('PUT', '/network/'  + data.network, data, headers);
//			}},
//		});
//	});
//
angular.module('tmCloudClientMessage', ['ngResource'])
	.factory('tmMsgQuery', function($resource, endpoint, tmAuth) {
		return $resource(endpoint + '/message-query/:network/:device', {
			network: '@network',
			device: '@device',
		}, {
			query: {method: 'GET', timeout: 60000}
		});
	})
	.factory('tmMsgStreamQuery', function(endpoint, tmAuth, tmCloud, $localStorage) {
		return function(query) {
			var url = endpoint + '/message-query';

			var qs = "?accept=application/json&stream=stream/" + query.network
			if (query.network) { url += '/' + query.network; delete query.network; }
			if (query.device) { url += '/' + query.device; delete query.device; }
			url += qs

			var sig = tmCloud.sign("GET", url, "");
			url += "&authorization=" + $localStorage.fingerprint + " " + sig;

			return new EventSource(url, {withCredentials: false});
		};
	})
	.factory('tmMsg', function($resource, endpoint, tmAuth) {
		return $resource(endpoint + '/message/:network/:device', {
			network: '@network',
			device: '@device',
		}, {
			create: {method: 'POST'}
		});
	})
	.factory('tmRawNetwork', function($resource, endpoint, tmAuth) {
		return $resource(endpoint + '/channel/:network/raw', {}, {
			raw: {method: 'POST'}
		});
	});
