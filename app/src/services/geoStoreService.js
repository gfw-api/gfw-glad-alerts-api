 'use strict';
var logger = require('logger');
var path = require('path');
var config = require('config');
var NotFound = require('errors/notFound');
var JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;



var deserializer = function(obj) {
    return function(callback) {
        new JSONAPIDeserializer({keyForAttribute: 'camelCase'}).deserialize(obj, callback);
    };
};


class GeoStoreService {

    static * getGeostoreByPath(path) {
        logger.debug('Obtaining geostore with path %s', path);
        let result = yield require('vizz.microservice-client').requestToMicroservice({
            uri: '/geostore' + path,
            method: 'GET',
            json: true
        });
        if (result.statusCode !== 200) {
            console.error('Error obtaining geostore:');
            console.error(result);
            return null;
        }
        let geostore = yield deserializer(result.body);
        if (geostore) {
            return geostore;
        }
        return null;
    }

    static * getNational(iso) {
        logger.debug('Obtaining national of iso %s', iso);
        return yield GeoStoreService.getGeostoreByPath(`/admin/${iso}`);
    }

    static * getSubnational(iso, id1) {
        logger.debug('Obtaining subnational of iso %s', iso);
        return yield GeoStoreService.getGeostoreByPath(`/admin/${iso}/${id1}`);
    }

    static * getUse(use, id) {
        logger.debug('Obtaining use with id %s', id);
        return yield GeoStoreService.getGeostoreByPath(`/use/${use}/${id}`);
    }

    static * getWdpa(wdpaid) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        return yield GeoStoreService.getGeostoreByPath(`/wdpa/${wdpaid}`);
    }

    static * getGeostore(hashGeoStore) {
        logger.debug('Obtaining geostore with hash %s', hashGeoStore);
        return yield GeoStoreService.getGeostoreByPath(`/${hashGeoStore}`);
    }


}

module.exports = GeoStoreService;
