'use strict';
var logger = require('logger');
var path = require('path');
var config = require('config');
var CartoDB = require('cartodb');
var Mustache = require('mustache');
var NotFound = require('errors/notFound');
var JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;

const ISO = `SELECT ST_AsGeoJSON(the_geom) AS geojson, (ST_Area(geography(the_geom))/10000) as area_ha
        FROM gadm2_countries_simple
        WHERE iso = UPPER('{{iso}}')`;

const ID1 = `SELECT ST_AsGeoJSON(the_geom) AS geojson, (ST_Area(geography(the_geom))/10000) as area_ha
        FROM gadm2_provinces_simple
        WHERE iso = UPPER('{{iso}}')
          AND id_1 = {{id1}}`;

const WDPA = `SELECT ST_AsGeoJSON(p.the_geom) AS geojson, (ST_Area(geography(the_geom))/10000) as area_ha
        FROM (
          SELECT CASE
          WHEN marine::numeric = 2 THEN NULL
            WHEN ST_NPoints(the_geom)<=18000 THEN the_geom
            WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
            ELSE ST_RemoveRepeatedPoints(the_geom, 0.005)
            END AS the_geom
          FROM wdpa_protected_areas
          WHERE wdpaid={{wdpaid}}
        ) p`;

const USE = `SELECT ST_AsGeoJSON(the_geom) AS geojson, (ST_Area(geography(the_geom))/10000) as area_ha
        FROM {{useTable}}
        WHERE cartodb_id = {{pid}}`;



var executeThunk = function(client, sql, params) {
    return function(callback) {
        logger.debug(Mustache.render(sql, params));
        client.execute(sql, params).done(function(data) {
            callback(null, data);
        }).error(function(err) {
            callback(err, null);
        });
    };
};

var deserializer = function(obj) {
    return function(callback) {
        new JSONAPIDeserializer({keyForAttribute: 'camelCase'}).deserialize(obj, callback);
    };
};


class CartoDBService {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
    }

    * getNational(iso, period) {
        logger.debug('Obtaining national of iso %s', iso);
        let params = {
            iso: iso
        };

        let data = yield executeThunk(this.client, ISO, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            return {geojson: JSON.parse(result.geojson), areaHa: result.area_ha};
        }
        return null;
    }

    * getSubnational(iso, id1, period) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        let params = {
            iso: iso,
            id1: id1
        };

        let data = yield executeThunk(this.client, ID1, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            return {geojson: JSON.parse(result.geojson), areaHa: result.area_ha};
        }
        return null;
    }

    * getUse(useTable, id, period) {
        logger.debug('Obtaining use with id %s', id);

        let params = {
            useTable: useTable,
            pid: id
        };

        let data = yield executeThunk(this.client, USE, params);

        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            return {geojson: JSON.parse(result.geojson), areaHa: result.area_ha};
        }
        return null;
    }

    * getWdpa(wdpaid, period) {
        logger.debug('Obtaining wpda of id %s', wdpaid);

        let params = {
            wdpaid: wdpaid
        };

        let data = yield executeThunk(this.client, WDPA, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            return {geojson: JSON.parse(result.geojson), areaHa: result.area_ha};
        }
        return null;
    }

    * getGeostore(hashGeoStore) {
        logger.debug('Obtaining geostore with hash %s', hashGeoStore);
        let result = yield require('vizz.microservice-client').requestToMicroservice({
            uri: '/geostore/' + hashGeoStore,
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


}

module.exports = new CartoDBService();
