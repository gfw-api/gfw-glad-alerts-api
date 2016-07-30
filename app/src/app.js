'use strict';
//load modules
var config = require('config');
var logger = require('logger');
var path = require('path');
var koa = require('koa');
var bodyParser = require('koa-bodyparser');
var koaLogger = require('koa-logger');
var loader = require('loader');
var validate = require('koa-validate');
var ErrorSerializer = require('serializers/errorSerializer');

// instance of koa
var app = koa();

//if environment is dev then load koa-logger
if (process.env.NODE_ENV === 'dev') {
    app.use(koaLogger());
}

app.use(bodyParser({
    jsonLimit: '50mb'
}));

//catch errors and send in jsonapi standard. Always return vnd.api+json
app.use(function*(next) {
    try {
        yield next;
    } catch (err) {
        this.status = err.status || 500;
        logger.error(err);
        this.body = ErrorSerializer.serializeError(this.status, err.message);
        if (process.env.NODE_ENV === 'prod' && this.status === 500) {
            this.body = 'Unexpected error';
        }
    }
    this.response.type = 'application/vnd.api+json';
});

var cache = require('lru-cache')({
    maxAge: 30000 // global max age
});

app.use(require('koa-cash')({
    get(key, maxAge) {
        logger.debug('Getting the cache key: %s', key);
        return cache.get(key);
    },
    set(key, value) {
        logger.debug('Setting in cache. key: %s, value: ', key, value);
        cache.set(key, value);
    }
}));

//load custom validator
app.use(validate());

//load routes
loader.loadRoutes(app);

//Instance of http module
var server = require('http').Server(app.callback());

// get port of environment, if not exist obtain of the config.
// In production environment, the port must be declared in environment variable
var port = process.env.PORT || config.get('service.port');

server.listen(port, function() {
    var p = require('vizz.microservice-client').register({
        id: config.get('service.id'),
        name: config.get('service.name'),
        dirConfig: path.join(__dirname, '../microservice'),
        dirPackage: path.join(__dirname, '../../'),
        logger: logger,
        app: app
    });
    p.then(function() {}, function(err) {
        logger.error(err);
        process.exit(1);
    });
});

logger.info('Server started in port:' + port);
