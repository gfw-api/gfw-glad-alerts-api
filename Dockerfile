FROM node:6.2
MAINTAINER raul.requero@vizzuality.com

RUN npm install -g grunt-cli bunyan
ENV NAME gfw-glad-alerts-api
ENV USER microservice

RUN groupadd -r $USER && useradd -r -g $USER $USER

RUN mkdir -p /opt/$NAME
ADD package.json /opt/$NAME/package.json
RUN cd /opt/$NAME && npm install


COPY entrypoint.sh /opt/$NAME/entrypoint.sh
COPY config /opt/$NAME/config

WORKDIR /opt/$NAME

COPY ./app /opt/$NAME/app
RUN chown $USER:$USER /opt/$NAME

# Tell Docker we are going to use this ports
EXPOSE 3600
USER $USER

ENTRYPOINT ["./entrypoint.sh"]
