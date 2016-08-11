'use strict';
var logger = require('logger');
var config = require('config');
var coRequest = require('co-request');
var CartoDB = require('cartodb');
var CartoDBService = require('services/cartoDBService');
const querystring = require('querystring');

const IMAGE_SERVER = 'http://gis-gfw.wri.org/arcgis/rest/services/image_services/glad_alerts_analysis/ImageServer/';
const CONFIRMED_IMAGE_SERVER = 'http://gis-gfw.wri.org/arcgis/rest/services/image_services/glad_alerts_con_analysis/ImageServer/';
const START_YEAR = 2015;
const MOSAIC_RULE = {
    'mosaicMethod': 'esriMosaicLockRaster',
    'ascending': true,
    'mosaicOperation': 'MT_FIRST'
};

const RASTERS = {
    all: {
        2015: 6,
        2016: 4
    },
    confirmedOnly: {
        2015: 7,
        2016: 5
    }
};

const YEAR_FOR_RASTERS = {
    6: 2015,
    7: 2015,
    4: 2016,
    5: 2016
};

class ArcgisService {
    static generateMosaicrule(raster){
        let mosaicrule = Object.assign({}, MOSAIC_RULE, { lockRasterIds: [raster] });
        return mosaicrule;
    }

    static geojsonToEsriJson(geojson){
        if(geojson.type === 'Polygon'){
            geojson.rings = geojson.coordinates;
            delete geojson.coordinates;
        } else if(geojson.type === 'MultiPolygon') {
            geojson.rings = geojson.coordinates[0];
            delete geojson.coordinates;
        }
        geojson.type = 'polygon';
        return geojson;
    }

    static getYearDay(date){
        var start = new Date(date.getFullYear(), 0, 0);
        var diff = date - start;
        var oneDay = 1000 * 60 * 60 * 24;
        var dayOfYear = Math.floor(diff / oneDay);
        return dayOfYear;
    }

    static dateToGridCode(date){
        return ArcgisService.getYearDay(date) + (365 * (date.getFullYear() - START_YEAR));
    }

    static rasterForDate(date, confirmed=false){
        if(confirmed){
            return RASTERS.confirmedOnly[date.getFullYear()];
        } else {
            return RASTERS.all[date.getFullYear()];
        }
    }

    static yearForRaster(raster){
        return YEAR_FOR_RASTERS[raster];
    }

    static rastersForPeriod(startDate, endDate, confirmed=false){
        let rasters = [];

        let begin = ArcgisService.rasterForDate(startDate, confirmed);

        if (rasters.indexOf(begin) === -1){
            rasters.push(begin);
        }
        let end = ArcgisService.rasterForDate(endDate, confirmed);
        if (rasters.indexOf(end) === -1){
            rasters.push(end);
        }

        return rasters;
    }

    static * getHistogram(rasters, esriJSON, confirmedOnly) {
        let formFields = {
            geometry: JSON.stringify(esriJSON),
            geometryType: 'esriGeometryPolygon',
            f: 'pjson'
        };

        let imageServer = IMAGE_SERVER;
        if (confirmedOnly) {
            imageServer = CONFIRMED_IMAGE_SERVER;
        }

        let results = {};

        for (let i = 0, length = rasters.length; i < length; i++){
            formFields.mosaicRule = JSON.stringify(ArcgisService.generateMosaicrule(rasters[i]));
            logger.debug('Doing request to arcgis with url ', `${imageServer}computeHistograms`, 'and formfields', querystring.stringify(formFields));
            let result = yield coRequest({
                uri: `${imageServer}computeHistograms`,
                method: 'POST',
                form: querystring.stringify(formFields),
                json: true
            });

            if(result.statusCode === 200 && !result.body.error) {
                logger.debug('Response OK. body: ');
                results[rasters[i]] = result.body;
            } else {
                logger.error('Error to obtain data in arcgis');
                if(result.body.error.code === 400 || result.body.error.code === 500 || result.statusCode === 500){
                    throw new Error('The area you have selected is quite large and cannot be analyzed on-the-fly. Please select a smaller area and try again.', rasters[i]);
                } else {
                    throw new Error('Error obtaining data in Arcgis');
                }
            }
        }
        logger.debug('Results', results);
        return results;
    }

    static datesToGridCodes(begin, end, raster) {
        let rasterYear = ArcgisService.yearForRaster(raster);

        let indexes = [];
        if(begin.getFullYear() === rasterYear) {
            indexes.push(ArcgisService.getYearDay(begin) -1);
        } else {
            var dateBegin = new Date(begin.getFullYear(), 0, 1, 0,0,0);
            indexes.push(ArcgisService.getYearDay(dateBegin) -1);
        }

        if(end.getFullYear() === rasterYear) {
            indexes.push(ArcgisService.getYearDay(end) -1);
        } else {
            var dateEnd = new Date(end.getFullYear(), 11, 31, 0,0,0);
            indexes.push(ArcgisService.getYearDay(dateEnd) -1);
        }
        return indexes;
    }

    static alertCount(begin, end, histograms){
        logger.debug('Histograms', histograms);
        let totalCount = 0;
        if(histograms){
            let rasters = Object.keys(histograms);
            for (let i = 0, length = rasters.length; i < length; i++){
                let counts = [];
                if(histograms[rasters[i]].histograms.length > 0){
                    counts = histograms[rasters[i]].histograms[0].counts;
                }
                let indexes = ArcgisService.datesToGridCodes(begin, end, rasters[i]);
                logger.debug('counts', JSON.stringify(counts));
                logger.debug('indexes', indexes, 'and raster ', rasters[i]);
                let subCounts = counts.slice(indexes[0], indexes[1] +1);
                logger.debug('subCounts', JSON.stringify(subCounts));
                let sum = 0;
                if(subCounts && subCounts.length > 0) {
                    sum = subCounts.reduce(function(oldVar, newVar){
                        return oldVar + newVar;
                    });
                }
                totalCount += sum;
            }
        }
        return totalCount;
    }

    static * getAlertCount(begin, end, geojson, confirmedOnly){
        logger.info('Get alerts count with begin ', begin, ' , end', end, 'and confirmedOnly ', confirmedOnly);
        begin = new Date(begin);
        end = new Date(end);

        let beginMin = new Date(2015, 0, 1, 0, 0, 0);
        let endMax = new Date(2016, 11, 31, 0, 0, 0);
        if(begin < beginMin) {
            logger.debug('Setting minimun date to ', beginMin);
            begin = beginMin;
        }
        if(end > endMax){
            logger.debug('Setting maximun date to ', endMax);
            end = endMax;
        }


        let rasters = ArcgisService.rastersForPeriod(begin, end, confirmedOnly);
        logger.debug('rasters', rasters);
        try{
            let esriJSON = ArcgisService.geojsonToEsriJson(geojson);
            let histograms = yield ArcgisService.getHistogram(rasters, esriJSON, confirmedOnly);
            logger.debug('histograms', histograms);
            let alertCount = ArcgisService.alertCount(begin, end, histograms);
            logger.debug('AlertCount', alertCount);
            return {
                begin: begin.toISOString(),
                end: end.toISOString(),
                value: alertCount,
                notes: '' // TODO: Add notess
            };
        } catch(err){
            logger.error(err);
            throw err;
        }
    }

    static getMaxDateFromHistograms(histograms) {
        logger.debug('Obtaining max date from histograms');
        let year = (Object.keys(histograms).length -1) + START_YEAR;
        let latestHistogramKey = Math.max.apply(null, Object.keys(histograms));
        let dayNumber = histograms[latestHistogramKey].length;
        let resultDate = new Date(new Date(year, 0, 1, 0,0,0).getTime() + (dayNumber * 24 * 60 * 60* 1000));
        return resultDate;
    }

    static * getFullHistogram(){
        logger.info('Get full histogram');
        var begin = new Date(START_YEAR, 0, 1, 0,0,0);
        var end = new Date();

        let endMax = new Date(2016, 11, 31, 0, 0, 0);
        if(end > endMax){
            logger.debug('Setting maximun date to ', endMax);
            end = endMax;
        }

        var rasters = ArcgisService.rastersForPeriod(begin, end);

        var results = {};
        for(let i = 0, length = rasters.length; i < length; i++) {
            let url = `${IMAGE_SERVER}${rasters[i]}/info/histograms?f=pjson`;
            logger.debug(`Doing request to ${url}`);
            let result = yield coRequest({
                uri: url,
                method: 'GET',
                headers:{
                    'Content-type': 'application/x-www-form-urlencoded'
                },
                json: true
            });

            if(result.statusCode === 200) {
                logger.debug('Response OK. body: ');
                results[ArcgisService.yearForRaster(rasters[i])] = result.body.histograms[0].counts;
            } else {
                if(result.body.error.code === 400 || result.body.error.code === 500 || result.statusCode === 500){
                    throw new Error('The area you have selected is quite large and cannot be analyzed on-the-fly. Please select a smaller area and try again.', rasters[i]);
                } else {
                    throw new Error('Error obtaining data in Arcgis');
                }
            }
        }

        return {
            minDate: begin.toISOString().slice(0, 10),
            maxDate: ArcgisService.getMaxDateFromHistograms(results).toISOString().slice(0, 10),
            counts: results
        };
    }

    static generateQuery(iso, id1, dateYearBegin, yearBegin, dateYearEnd, yearEnd, confirmed){
        let query = `select sum(count) as value from table where country_iso='${iso}' ${id1 ? ` and state_iso = '${iso}${id1}' `: ''} ${confirmed ? ' and confidence like \'confirmed\' ' : ''}`;
        if(yearBegin === yearEnd){
            query += ` and year like '${yearBegin}' and day::int >= ${dateYearBegin} and day::int <= ${dateYearEnd} `;
        } else {
            query += ' and (';
            logger.debug('Datebegin', dateYearBegin, 'end', dateYearEnd);
            for (let i = yearBegin; i <= yearEnd; i++) {
                if(i > yearBegin){
                    query +=' or ';
                }
                if(i === yearBegin){
                    query += `(year like '${i}' and day::int >= ${dateYearBegin})`;
                } else if(i === yearEnd) {
                    query += `(year like '${i}' and day::int <= ${dateYearEnd})`;
                } else {
                    query += `(year like '${i}')`;
                }
            }
            query += ')';
        }
        logger.debug('Query result: ', query);
        return query;
    }

    static * getAlertCountByJSON(begin, end, iso, id1, confirmedOnly ){
        logger.debug('Obtaining count with iso %s and id1 %s', iso, id1);
        let dateYearBegin = ArcgisService.getYearDay(begin);
        let yearBegin = begin.getFullYear();
        let dateYearEnd = ArcgisService.getYearDay(end);
        let yearEnd = end.getFullYear();

        let query = ArcgisService.generateQuery(iso, id1, dateYearBegin, yearBegin, dateYearEnd, yearEnd, confirmedOnly);
        logger.debug('Doing request to ', `/query/${config.get('dataset.idGlad')}?sql=${query}`);
        let result = yield require('vizz.microservice-client').requestToMicroservice({
            uri: encodeURI(`/query/${config.get('dataset.idGlad')}?sql=${query}`),
            method: 'GET',
            json: true
        });

        if (result.statusCode !== 200) {
            console.error('Error doing query:');
            // console.error(result);
            throw new Error('Error doing query');
        } else {
            return result.body.data.attributes.rows[0];
        }
    }

    static * getAlertCountByISO(begin, end, iso, confirmedOnly){
        logger.info('Get alerts by iso %s', iso);
        let data = yield CartoDBService.getNational(iso);
        if(data) {
            logger.debug('Obtained geojson. Obtaining alerts');
            let alerts = yield ArcgisService.getAlertCountByJSON(begin, end, iso, null, confirmedOnly);
            if(!alerts){
                alerts = {
                    value: 0
                };
            }
            alerts.areaHa = data.areaHa;
            return alerts;
        }
        return null;
    }
    static * getAlertCountByID1(begin, end, iso, id1, confirmedOnly){
        logger.info('Get alerts by iso %s and id1', iso, id1);
        let data = yield CartoDBService.getSubnational(iso, id1);
        if(data) {
            logger.debug('Obtained geojson. Obtaining alerts');
            let alerts = yield ArcgisService.getAlertCountByJSON(begin, end, iso, id1, confirmedOnly);
            if(!alerts){
                alerts = {
                    value: 0
                };
            }
            alerts.areaHa = data.areaHa;
            return alerts;
        }
        return null;
    }
    static * getAlertCountByWDPA(begin, end, wdpaid, confirmedOnly){
        logger.info('Get alerts by wdpa %s', wdpaid);
        let data = yield CartoDBService.getWdpa(wdpaid);
        if(data) {
            logger.debug('Obtained geojson. Obtaining alerts');
            let alerts = yield ArcgisService.getAlertCount(begin, end, data.geojson, confirmedOnly);
            alerts.areaHa = data.areaHa;
            return alerts;
        }
        return null;
    }
    static * getAlertCountByUSE(begin, end, useTable, id, confirmedOnly){
        logger.info('Get alerts by use %s and id', useTable, id);
        let data = yield CartoDBService.getUse(useTable, id);
        if(data) {
            logger.debug('Obtained geojson. Obtaining alerts');
            let alerts = yield ArcgisService.getAlertCount(begin, end, data.geojson, confirmedOnly);
            alerts.areaHa = data.areaHa;
            return alerts;
        }
        return null;
    }
    static * getAlertCountByGeostore(begin, end, geostoreHash, confirmedOnly){
        logger.info('Get alerts by geostorehash %s', geostoreHash);
        let data = yield CartoDBService.getGeostore(geostoreHash);
        if(data) {
            logger.debug('Obtained geojson. Obtaining alerts');
            let alerts = yield ArcgisService.getAlertCount(begin, end, data.geojson.features[0].geometry, confirmedOnly);
            alerts.areaHa = data.areaHa;
            return alerts;
        }
        return null;
    }
}

module.exports = ArcgisService;