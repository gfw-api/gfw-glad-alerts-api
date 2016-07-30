'use strict';
var logger = require('logger');
var path = require('path');
var config = require('config');
var CartoDB = require('cartodb');
var Mustache = require('mustache');
var NotFound = require('errors/notFound');
var JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;

const WORLD = `SELECT COUNT(iso) AS value, MIN(date) as min_date, MAX(date) as max_date
        FROM  umd_alerts_agg_analysis f
        WHERE date >= '{{begin}}'::date
          AND date <= '{{end}}'::date
          AND ST_INTERSECTS(
                ST_Transform(
                  ST_SetSRID(
                    ST_GeomFromGeoJSON('{{{geojson}}}'),
                  4326),
                3857),
              f.the_geom_webmercator) `;

const ISO = `with s as (select area_ha
            FROM gadm2_countries_simple
            WHERE iso = UPPER('{{iso}}'))
            SELECT COUNT(iso) AS value, MIN(date) as min_date, MAX(date) as max_date, area_ha
                    FROM umd_alerts_agg_analysis f right join s
                    ON iso = UPPER('{{iso}}')
                    AND date >= '{{begin}}'::date
                    AND date <= '{{end}}'::date
            group by area_ha `;

const ID1 = `WITH r as (SELECT  ST_RemoveRepeatedPoints(the_geom_webmercator, 1000) the_geom_webmercator, area_ha
                   FROM gadm2_provinces_simple
                   WHERE iso = UPPER('{{iso}}')
                   AND id_1 = {{id1}} )
                SELECT COUNT(f.iso) AS value, MIN(date) as min_date, MAX(date) as max_date, area_ha
                FROM umd_alerts_agg_analysis f INNER JOIN r ON st_intersects(r.the_geom_webmercator,f.the_geom_webmercator) and date >= '{{begin}}'::date
                AND date <= '{{end}}'::date
                group by area_ha
                `;

const USE = `SELECT COUNT(iso) AS value, MIN(date) as min_date, MAX(date) as max_date, area_ha
            FROM {{useTable}} u left join umd_alerts_agg_analysis f
            on  ST_Intersects(f.the_geom_webmercator, u.the_geom_webmercator)
            AND date >= '{{begin}}'::date
            AND date <= '{{end}}'::date
            WHERE u.cartodb_id = {{pid}}
            group by area_ha`;

const WDPA = `WITH p as (SELECT CASE when marine::numeric = 2 then null
        when ST_NPoints(the_geom)<=18000 THEN the_geom_webmercator
       WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom_webmercator, 100)
      ELSE ST_RemoveRepeatedPoints(the_geom_webmercator, 1000)
       END as the_geom_webmercator, gis_area*100 as area_ha FROM wdpa_protected_areas where wdpaid={{wdpaid}})
        SELECT COUNT(iso) AS value, MIN(date) as min_date, MAX(date) as max_date, area_ha
        FROM umd_alerts_agg_analysis f right join p
        on ST_Intersects(f.the_geom_webmercator, p.the_geom_webmercator)
              AND date >= '{{begin}}'::date
              AND date <= '{{end}}'::date
            group by area_ha`;

const LATEST = `SELECT DISTINCT date
        FROM umd_alerts_agg_analysis
        ORDER BY date DESC
        LIMIT {{limit}}`;



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


let getToday = function() {
    let today = new Date();
    return `${today.getFullYear().toString()}-${(today.getMonth()+1).toString()}-${today.getDate().toString()}`;
};

let getYesterday = function() {
    let yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return `${yesterday.getFullYear().toString()}-${(yesterday.getMonth()+1).toString()}-${yesterday.getDate().toString()}`;
};


let defaultDate = function() {
    let to = getToday();
    let from = getYesterday();
    return from + ',' + to;
};

class CartoDBService {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
        this.apiUrl = config.get('cartoDB.apiUrl');
    }

    getDownloadUrls(query, params) {
        try{
            let formats = ['csv', 'geojson', 'kml', 'shp', 'svg'];
            let download = {};
            let queryFinal = Mustache.render(query, params);
            queryFinal = queryFinal.replace('COUNT(iso) AS value, MIN(date) as min_date, MAX(date) as max_date', ' f.date, st_transform(f.the_geom_webmercator, 4326) as the_geom, ST_Y(st_transform(the_geom_webmercator, 4326)) as lat, ST_X(st_transform(the_geom_webmercator, 4326)) as long');
            queryFinal = encodeURIComponent(queryFinal);
            for(let i=0, length = formats.length; i < length; i++){
                download[formats[i]] = this.apiUrl + '?q=' + queryFinal + '&format=' + formats[i];
            }
            return download;
        }catch(err){
            logger.error(err);
            throw err;
        }
    }


    * getNational(iso, period = defaultDate()) {
        logger.debug('Obtaining national of iso %s', iso);
        let periods = period.split(',');
        let params = {
            iso: iso,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, ISO, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];

            result.downloadUrls = this.getDownloadUrls(ISO, params);
            return result;
        }
        return null;
    }

    * getSubnational(iso, id1, period = defaultDate()) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        let periods = period.split(',');
        let params = {
            iso: iso,
            id1: id1,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, ID1, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];

            result.downloadUrls = this.getDownloadUrls(ID1, params);
            return result;
        }
        return null;
    }

    * getUse(useTable, id, period = defaultDate()) {
        logger.debug('Obtaining use with id %s', id);
        let periods = period.split(',');
        let params = {
            useTable: useTable,
            pid: id,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, USE, params);

        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            result.downloadUrls = this.getDownloadUrls(USE, params);
            return result;
        }
        return null;
    }

    * getWdpa(wdpaid, period = defaultDate()) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        let periods = period.split(',');
        let params = {
            wdpaid: wdpaid,
            begin: periods[0],
            end: periods[1]
        };

        let data = yield executeThunk(this.client, WDPA, params);
        if (data.rows && data.rows.length > 0) {
            let result = data.rows[0];
            result.downloadUrls = this.getDownloadUrls(WDPA, params);
            return result;
        }
        return null;
    }

    * getGeostore(hashGeoStore) {
        logger.debug('Obtaining geostore with hash %s', hashGeoStore);
        let result = yield require('microservice-client').requestToMicroservice({
            uri: '/geostore/' + hashGeoStore,
            method: 'GET',
            json: true
        });
        if (result.statusCode !== 200) {
            console.error('Error obtaining geostore:');
            console.error(result);
            return null;
        }
        return yield deserializer(result.body);
    }

    * getWorld(hashGeoStore, period = defaultDate()) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);

        let geostore = yield this.getGeostore(hashGeoStore);
        if (geostore && geostore.geojson) {
            logger.debug('Executing query in cartodb with geostore', geostore);
            let periods = period.split(',');
            let params = {
                geojson: JSON.stringify(geostore.geojson.features[0].geometry),
                begin: periods[0],
                end: periods[1]
            };

            let data = yield executeThunk(this.client, WORLD, params);
            if (data.rows && data.rows.length > 0) {
                let result = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.downloadUrls = this.getDownloadUrls(WORLD, params);
                return result;
            }
            return null;
        }
        throw new NotFound('Geostore not found');
    }

    * latest(limit=3) {
        logger.debug('Obtaining latest with limit %s', limit);
        let params = {
            limit: limit
        };
        let data = yield executeThunk(this.client, LATEST, params);
        logger.debug('data', data);
        if (data.rows ) {
            let result = data.rows;
            return result;
        }
        return null;
    }

}

module.exports = new CartoDBService();
