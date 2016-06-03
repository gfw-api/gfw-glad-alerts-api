'use strict';
var logger = require('logger');
var should = require('should');
var assert = require('assert');
var errorSerializer = require('serializers/errorSerializer');

describe('Error serializer test', function() {
    var data = [
        {
          name: 'Name not valid'
        },
        {
          surname: 'Surname not valid'
        }
    ];

    before(function*() {

    });

    it('Generate correct jsonapi response', function() {
      let response = errorSerializer.serializeValidationBodyErrors(data);
      
      response.should.not.be.a.Array();
      response.should.have.property('errors');
      response.errors.should.have.length(2);
      let error = response.errors[0];

      error.should.have.property('source');
      error.should.have.property('title');
      error.should.have.property('detail');
      error.should.have.property('code');
      error.detail.should.be.a.String();
      error.title.should.be.a.String();
      error.code.should.be.a.String();
      error.source.should.be.a.Object();
      error.source.should.have.property('parameter');
      error.source.parameter.should.be.a.String();
    });

    after(function*() {

    });
});
