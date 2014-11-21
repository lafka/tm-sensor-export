angular.module('BuildingLabExport', ['tmCloudClient', 'angular-loading-bar'], function($provide) {
      $provide.value('endpoint', 'http://31.169.50.34:8080');
      //$provide.value('endpoint', 'https://http.cloud.tiny-mesh.com/v1');
      //$provide.value('endpoint', 'http://localhost:4000');
   })
   .config(['cfpLoadingBarProvider', function(cfpLoadingBarProvider) {
   }])
   .controller('AuthController', function($rootScope, $scope, $localStorage, tmAuthSession, tmUser) {
      $scope.user = new tmUser();
      $scope.$auth = $localStorage;

      // Wait until session is created before populating user object
      $rootScope.$on('session:new', function(ev, auth) {
         $scope.user.$get();
         $scope.flash = "";
      });

      $rootScope.$on('session:destroy', function(ev) {
         $scope.user.$get();
         $scope.flash = "You have been logged out of your session.";
         $scope.flashClass = "info";
      });

      $scope.logout = function() {
         tmAuthSession.logout();
      };

      tmAuthSession.maybeAuthenticate();
   })
   .controller('LoginController', function($rootScope, $scope, tmUser, tmAuthSession) {
      $scope.login = function(auth) {
         $scope.$parent.flashClass = '';
         $scope.$parent.flash = '';
         tmAuthSession.login(auth.email, auth.password)
            .catch(function() {
               $scope.$parent.flashClass = "danger";
               $scope.$parent.flash = "Invalid username or password.";
            });
      };
   })
   .controller('AppController', function($scope, $location, $q,
         tmNet, tmMsgQuery) {
      // rude way getting the current local time as utc string
      // point beeing that people (meaning me) think of time in the
      // place that the network is installed. If I have a network of
      // sensors in London I usually want to export data in a certain
      // time period (ie. 12:00 in UTC) without calculating the
      // timezone difference in my head....
      //var localtime = function(date) {
      //   return new Date(date.getTime() + Math.abs(-480 * 60000))
      //                  .toISOString()
      //                  .replace(/:[0-9]{2}\..*$/, '');
      //};

      $scope.exporting = false;
      $scope.select  = {};
      $scope.devices = {};
      $scope.collapseNets = false;
      $scope.networks = [];
      $scope.net = undefined;
      $scope.$location = $location;

      $scope.convergeLocaltime = function(date, tz) {
         return new Date(date.valueOf() + Math.abs(tz * 60000));
      };

      $scope.setType = function(t) {
         _.each($scope.select, function(v, k) {
            $scope.select[k] = k === t ? $scope.select[k] : false;
         });

         $location.search('type',
            _.reduce($scope.select, function(acc, v, k) {
               if (v) acc.push(k); return acc;
            }, []));

         _.each($scope.net.devicemap, function(v, k) {
            $scope.devices[k] = (t === '_' || v.type === t);
         });

         $location.search('devices',
            _.reduce($scope.devices, function(acc, v, k) {
               if (v) acc.push(k); return acc;
            }, []));
      };
      $scope.setDevice = function(dev) {
         _.each($scope.select, function(v, k) {
            $scope.select[k] = false;
         });

         $location.search('devices',
            _.reduce($scope.devices, function(acc, v, k) {
               if (v) acc.push(k); return acc;
            }, []));
      };

      var now = new Date();
      // date.{to,from} -> actual time in the timezone specified by date.timezone
      $scope.date = {
         from: new Date($location.search()['date.from'] || now.getTime() - (now.getTime() % 86400000)),
         to: new Date($location.search()['date.to'] || now.valueOf() + (now.getTimezoneOffset() * 60000 * -1)),
         timezone: $location.search()['date.timezone'] || now.getTimezoneOffset()
      };

      $scope.$on('session:new', function() {
         $scope.networks = angular.copy($scope.user.networks);
      });

      $scope.setNet = function(k, nosearch) {
         nosearch || $location.search('network', k);
         tmNet.get({id: k}).$promise.then(function(net) {
            $scope.net = angular.copy(net);
            $scope.collapseNets = true;

            var devs = $location.search().devices,
                type = $location.search().type;
            if (type) {
               $scope.select[type] = true;
               $scope.setType(type);
            } else {
               if ('string' === typeof devs) {
                  devs = [devs];
               }
               _.each(devs, function(k, v) { $scope.devices[k] = true; });
            }
         });
      };

      $scope._ = _;
      $scope.qErr = {};
      $scope.export = function(netk, date, devices) {
         if (!date.from) {
            $scope.qErr['From date'] = 'Invalid or unset from date';
         } else if (!date.to) {
            $scope.qErr['From to'] = 'Invalid or unset to date';
         } else if (!date.timezone) {
            $scope.qErr['Timezone'] = 'Invalid or unset timezone';
         } else if (!$scope.net) {
            $scope.qErr['Network'] = 'Invalid or unset network';
         } else {
            delete $scope.qErr['From date'];
            delete $scope.qErr['From to'];
            delete $scope.qErr['Timezone'];
            delete $scope.qErr['Network'];
         }

         $location.search('date.from',  date.from.toISOString());
         $location.search('date.to', date.to.toISOString());
         $location.search('date.timezone', date.timezone);

         if (_.size($scope.qErr) !== 0)
            return null;

         var datefrom = $scope.convergeLocaltime(date.from, date.timezone),
             dateto   = $scope.convergeLocaltime(date.to, date.timezone);
         var query = {
            'date.from': datefrom.toISOString().replace(/\.[0-9]*Z$/, ''),
            'date.to':     dateto.toISOString().replace(/\.[0-9]*Z$/, ''),
            'query': 'proto/tm.type:event'
         };

         var activedevices = _.reduce(devices, function(acc, v, k) {
            v && acc.push(k);
            return acc;
         }, [])

         var q = tmMsgQuery.query(_.extend(query, {
            network: netk,
            device: activedevices.join(',')
         }));

         var parse = function(data) {
            var proto = data['proto/tm'];

            return {
                date: new Date(data.datetime),
                selector: data.selector,
                temp: Math.trunc((((((proto.locator & 65535) / 4) / 16382) * 165) - 40)*100) / 100,
                co2: data['proto/tm'].msg_data,
                light: Math.trunc(Math.pow(10, proto.analog_io_0 * 0.0015658)),
                moist: Math.trunc(((proto.locator >> 16) / 16382) * 100),
                movement: proto.digital_io_5,
                noise:  Math.trunc((90 - (30 * (proto.analog_io_1 / 2048))) * 100) / 100
            };
         };

         var downloadbuf = function(filename, text) {
            var pom = document.createElement('a');
            pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
            pom.setAttribute('download', filename);
            pom.click();
         }
         q.$promise.then(function(val) {
            // $scope.date is stored as UTC time, but represents local
            // time according to Timezone.
            // val.result[n].datetime is actual UTC time
            var date = {
               from: $scope.convergeLocaltime($scope.date.from, -1 * $scope.date.timezone),
               to: $scope.convergeLocaltime($scope.date.to, -1 * $scope.date.timezone),
            };

            var buf = "";

            _.each(val.result, function(item) {
               var res = parse(item);
               if (res.date > date.from && res.date < date.to) {
                   buf += [
                      $scope.convergeLocaltime(res.date, -1 * $scope.date.timezone).toISOString().replace(/\..*$/, ''),
                      item.selector.join('/'),
                      $scope.net.devicemap[item.selector[1]].type,
                      res.co2,
                      res.temp,
                      res.light,
                      res.moist,
                      res.movement,
                      res.noise].join(';') + "\r\n";
               }
            });

            var f = $scope.date.from.toISOString().replace(/\..*$/, ''),
                t = $scope.date.to.toISOString().replace(/\..*$/, '');

            downloadbuf('export-' + f + '_' + t + '.csv', buf);
         });
      };

      if ($location.search().network) {
         $scope.setNet($location.search().network, true);
      }
   })
   .directive('formatdt', function() {
      return {
         restrict: 'A',
         require: '?ngModel',
         scope: {
            timezone: '@formatdt'
         },
         link: function($scope, element, attrs, ngModelController) {
            ngModelController.$parsers.push(function(date) {
               return ('string' === typeof(date)) ? new Date(date) : date;
            });
            ngModelController.$formatters.push(function(date) {
               return date.toISOString().replace(/:[0-9]{2}\..*$/, '');
            });
        }
      }
   })
   .directive('formattz', function() {
      return {
         restrict: 'A',
         require: '?ngModel',
         link: function(scope, element, attrs, ngModelController) {
            ngModelController.$parsers.push(function(data) {
               match = data.match(/([+-]?)([0-9]{2}):([0-9]{2})/);
               if (match
                     && parseInt(match[2]) >= 0 && parseInt(match[2]) <= 11
                     && parseInt(match[3]) >= 0 && parseInt(match[3]) <= 59) {
                  ngModelController.$setValidity('tz-validator', true);
                  return (parseInt(match[2]) * 60 + parseInt(match[3])) * ('-' === match[1] ? 1 : -1);
               } else {
                  ngModelController.$setValidity('tz-validator', false);
                  return undefined;
               }
            });
            ngModelController.$formatters.push(function(offset) {
               //convert data from model format to view format
               var tzhours = offset / 60,
                   tzmins  = offset % 60;
               var tz = _.map(["00" + (tzhours * - 1), "00" + Math.abs(tzmins)],
                              function(v) { return v.slice(-2, 4); }).join(":");

               return (Math.sign(tzhours * -1) > 0 ? "+" : "-") + tz;
            });
        }
      }
   })
   .directive('modal', function () {
      return {
         template: '<div class="modal fade">' +
            '<div class="modal-dialog">' +
               '<div class="modal-content">' +
                  '<div class="modal-header">' +
//                     '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>' + 
                     '<h4 class="modal-title">{{ title }}</h4>' +
                  '</div>' +
                  '<div class="modal-body" ng-transclude></div>' +
                  '</div>' +
               '</div>' +
            '</div>',
            restrict: 'E',
            transclude: true,
            replace:true,
            scope:true,
            link: function postLink(scope, element, attrs) {
               scope.title = attrs.title;

               scope.$watch(attrs.visible, function(value) {
                  if(value == true)
                     $(element).modal('show');
                  else
                     $(element).modal('hide');
               });

               $(element).on('shown.bs.modal', function(){
                     scope.$parent[attrs.visible] = true;
               });

               $(element).on('hidden.bs.modal', function(){
                     scope.$parent[attrs.visible] = false;
               });
            }
      };
   });
