'use strict';

var logger = require('logger');
var JSONAPISerializer = require('jsonapi-serializer').Serializer;
var gladAlertsSerializer = new JSONAPISerializer('glad-alerts', {
    attributes: ['value', 'period', 'min_date', 'max_date', 'downloadUrls'],
    typeForAttribute: function(attribute, record) {
        return attribute;
    },
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    }
});

var gladLatestSerializer = new JSONAPISerializer('imazon-latest', {
    attributes: ['date'],
    typeForAttribute: function(attribute, record) {
        return attribute;
    }
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
