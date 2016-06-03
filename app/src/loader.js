/**
 * Load routers
 */
module.exports = (function () {
  'use strict';
  var fs = require('fs');
  var routersPath = __dirname + '/routes';
  var logger = require('logger');
  var mount = require('koa-mount');

  var loadAPI = function (app, path, pathApi) {
    var routesFiles = fs.readdirSync(path);
    var existIndexRouter = false;
    routesFiles.forEach(function (file) {
      var newPath = path ? (path + '/' + file) : file;
      var stat = fs.statSync(newPath);

      if(!stat.isDirectory()) {
        if(file.lastIndexOf('Router.js') !== -1) {
          if(file === 'indexRouter.js') {
            existIndexRouter = true;
          } else {
            logger.debug('Loading route %s, in path %s', newPath, pathApi);
            if(pathApi) {
              app.use(mount(pathApi, require(newPath).middleware()));
            } else {
              app.use(require(newPath).middleware());
            }
          }
        }
      } else {
        // is folder
        var newPathAPI = pathApi ? (pathApi + '/' + file) : '/' + file;
        loadAPI(app, newPath, newPathAPI);
      }
    });
    if(existIndexRouter) {
      // load indexRouter when finish other Router
      var newPath = path ? (path + '/indexRouter.js') : 'indexRouter.js';
      logger.debug('Loading route %s, in path %s', newPath, pathApi);
      if(pathApi) {
        app.use(mount(pathApi, require(newPath).middleware()));
      } else {
        app.use(require(newPath).middleware());
      }
    }
  };

  var loadRoutes = function (app) {
    logger.debug('Loading routes...');
    loadAPI(app, routersPath);
    logger.debug('Loaded routes correctly!');
  };


  return {
    loadRoutes: loadRoutes
  };

}());
