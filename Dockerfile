FROM ubuntu:latest

RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    wget \
    cmake \
    dos2unix \
    git \
    nodejs \
    npm \
    nano \
    sudo \
    apt-transport-https \
    ca-certificates \
    software-properties-common

WORKDIR /src

RUN git clone https://github.com/emscripten-core/emsdk.git && \
    /src/emsdk/emsdk install latest && \
    /src/emsdk/emsdk activate latest