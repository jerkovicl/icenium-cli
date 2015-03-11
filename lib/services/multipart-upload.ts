///<reference path="../.d.ts"/>
"use strict";

import Future = require("fibers/future");
import util = require("util");
import querystring = require('querystring');

export class MultipartUploadService implements IMultipartUploadService {
	private static CHUNK_SIZE = 1024 * 1024 * 20;
	private static MIN_CHUNK_SIZE = 1024 * 1024 * 2;
	private static INPUT_FILE_ENCODING = "binary";
	private static HASH_ALGORITHM = "sha512";
	private static HASH_ENCODING = "base64";
	private static MAX_CONCURRENT_UPLOADS = 3;

	constructor(private $fs: IFileSystem,
		private $server: Server.IServer,
		private $serviceProxy: Server.IServiceProxy,
		private $hashService: IHashService,
		private $errors: IErrors,
		private $logger: ILogger) { }

	public uploadFileByChunks(filePath: string, bucketKey: string): IFuture<void> {
		return (() => {
			var fileSize: number = this.$fs.getFileSize(filePath).wait();
			var chunkStartByte = 0,
				endByte: number;

			this.$server.upload.initUpload(bucketKey).wait();

			var chunks: IFuture<void>[] = [];
			while(chunkStartByte < fileSize) {
				// exclusive endByte
				endByte = chunkStartByte + MultipartUploadService.CHUNK_SIZE;

				// In case the last chunk is shorter than CHUNK_SIZE or 
				// this chunk is before last and last one's length is shorter than MIN_CHUNK_SIZE
				// set the endByte to the last byte of the file.
				if(endByte > fileSize || (fileSize - endByte) < MultipartUploadService.MIN_CHUNK_SIZE) {
					endByte = fileSize;
				}

				var chunkStream = this.$fs.createReadStream(filePath, { start: chunkStartByte, end: endByte });
				var future = this.uploadChunk(bucketKey, chunkStartByte, endByte, chunkStream, fileSize);
				chunks.push(future);
				chunkStartByte = endByte;
				if(chunks.length === MultipartUploadService.MAX_CONCURRENT_UPLOADS) {
					Future.wait(chunks);
					chunks = [];
				}
			}

			if(chunks.length > 0) {
				Future.wait(chunks);
			}

			var fileHash = this.$hashService.getFileHash(filePath, MultipartUploadService.INPUT_FILE_ENCODING, MultipartUploadService.HASH_ALGORITHM, MultipartUploadService.HASH_ENCODING).wait();

			this.$server.upload.completeUpload(bucketKey, fileHash).wait();
		}).future<void>()();
	}

	private uploadChunk(path: string, startingIndex: number, endIndex: number, content: NodeJS.ReadableStream, fileSize: number): IFuture<void> {
		var headers = {
			"Content-Range": util.format("bytes %d-%d/%s", startingIndex, endIndex - 1, fileSize),
			"Content-Length": endIndex - startingIndex
		};

		this.$logger.trace("Uploading chunk with Content-Range: %s", headers["Content-Range"]);
		// hack to override chunkUpload as in autogenerated code we cannot specify Content-Range header.
		return this.$serviceProxy.call<void>('UploadChunk', 'PUT', ['api', 'upload', encodeURI(path.replace(/\\/g, '/'))].join('/'), null, [{ name: 'content', value: content, contentType: 'application/octet-stream' }], null, headers);
	}
}
$injector.register("multipartUploadService", MultipartUploadService);