'use strict';

var logger = require('logger');
var JSONAPISerializer = require('jsonapi-serializer').Serializer;
var gladAlertsSerializer = new JSONAPISerializer('glad-alerts', {
    attributes: ['value', 'period', 'minDate', 'maxDate', 'downloadUrls', 'areaHa'],
    typeForAttribute: function(attribute, record) {
        return attribute;
    },
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

var gladLatestSerializer = new JSONAPISerializer('imazon-latest', {
    attributes: [ 'minDate', 'maxDate', 'counts'],
    typeForAttribute: function(attribute, record) {
        return attribute;
    },
    counts:{
        attributes: ['2014', '2015', '2016', '2017']
    },
    keyForAttribute: 'camelCase'
});

class GladAlertsSerializer {

    static serialize(data) {
        return gladAlertsSerializer.serialize(data);
    }
    static serializeLatest(data) {
        return gladLatestSerializer.serialize(data);
    }
}

module.exports = GladAlertsSerializer;
