/* node server.js
  webbserver som till�ter uppladdning av filer till azure storage
  dessa environment variabler m�ste s�ttas innan servern startas:
set AZURE_STORAGE_ACCOUNT=portalvhdsgfh152bhy290k
set AZURE_STORAGE_ACCESS_KEY=[key from azure] ---se appsettings.bat, checkas inte in i git
  
obs! bra l�nk som �r r�tt och inte fel!, http://azure.microsoft.com/sv-se/develop/nodejs/
obs! om hur man laddar upp och skapar fil innan, http://stackoverflow.com/questions/18317904/stream-uploaded-file-to-azure-blob-storage-with-node
ocks� en l�nk som har r�tt information, http://azure.microsoft.com/sv-se/documentation/articles/storage-nodejs-how-to-use-table-storage/
*/
var express = require("express");
var azure = require("azure-storage");
var bodyParser = require('body-parser'); //connects bodyParsing middleware
var formidable = require('formidable');
var path = require('path');     //used for file path
var fs = require('fs-extra');    //File System-needed for renaming file etc
var uuid = require('node-uuid');
var async = require("async");

var app = express();
var containerName = "cntolapp";
var tableName = "tblolapp";
var AZURE_STORAGE_ACCOUNT = "portalvhdsgfh152bhy290k";
var AZURE_STORAGE_ACCESS_KEY = process.env.AZURE_STORAGE_ACCESS_KEY;
var hostName = "https://" + AZURE_STORAGE_ACCOUNT + ".blob.core.windows.net";
var partitionKey = "photos";

//s� h�r ska det se ut numer. det bortkommenterade �r gammalt.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
//app.use(bodyParser({ defer: true }));

//l�gg uppladdade filer i speciella mappar, som skapas h�r.
var uploadDir = "upload";
var thumbPrefix = "t_";
var thumbDir = thumbPrefix + uploadDir;
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir);
}

//statiska html-filer ligger i public/
app.use(express.static(path.join(__dirname, 'public')));
console.log("public=" + path.join(__dirname, 'public'));

//edit.html postar hit.
app.post('/update', function (req, res, next) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if (err) throw err;

        var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);

        var entGen = azure.TableUtilities.entityGenerator;

        console.log(fields.textarea123);
        var task = {
            PartitionKey: entGen.String(fields.partitionkey),//obligatorisk
            RowKey: entGen.String(fields.rowkey),//obligatorisk
            description: entGen.String(fields.description),
            textarea: entGen.String(fields.textarea123),
//            hidden: entGen.Boolean(fields.hidden),/*anv�nder string bara f�r att det inte ska krocka med att den var string f�rr*/
            hidden: entGen.String(fields.hidden ? 'on' : 'false'),
            sortorder: entGen.String(fields.sortorder),
        };
        tableSvc.mergeEntity(tableName, task, function (error, result, response) {
            if (err) throw err;
            //efter post, visa list.html        
            var fullUrl = req.protocol + '://' + req.get('host');
            console.log("url=" + fullUrl);
            res.redirect(fullUrl + "/list.html");
        });
    });    
});//slut update

app.post('/delete', function (req, res, next) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if (err) throw err;

        var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);

        tableSvc.retrieveEntity(tableName, fields.partitionkey, fields.rowkey, function (err, result, response) {
            if (err) throw err;
//            console.log(result['mediumName']['_']);
            var blobService = azure.createBlobService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);

//hittade ingen metod f�r att ta bort blob if exists
            if (result['thumbName']) {
                blobService.deleteBlob(containerName, result['thumbName']['_'], function (err, response) {
                    console.log("del blb " + result['thumbName']['_'] + ", err?=" + JSON.stringify(err));
                });
            }
            if (result['mediumName']) {
                blobService.deleteBlob(containerName, result['mediumName']['_'], function (err, response) {
                    console.log("del blb " + result['mediumName']['_'] + ", err?=" + JSON.stringify(err));
                });
            }
            if (result['imgName']) {
                blobService.deleteBlob(containerName, result['imgName']['_'], function (err, response) {
                    console.log("del blb " + result['imgName']['_'] + ", err?=" + JSON.stringify(err));
                });
            }

//ta bort tabellen till sist
            var entGen = azure.TableUtilities.entityGenerator;
            var task = {
                PartitionKey: entGen.String(fields.partitionkey),//obligatorisk
                RowKey: entGen.String(fields.rowkey)//obligatorisk
            };//obs! m�ste ta bort tillh�rande blobbar me.
            tableSvc.deleteEntity(tableName, task, function (error, result, response) {
                if (err) throw err;
                var fullUrl = req.protocol + '://' + req.get('host');
                res.redirect(fullUrl + "/list.html");
            });
        });
    });
});//slut delete

app.post('/formhandler', function (req, res, next) {
    console.log(req.body);
    var form = new formidable.IncomingForm();
    form.uploadDir = uploadDir;       //set upload directory, Formidable uploads to operating systems tmp dir by default
    form.keepExtensions = true;     //keep file extension

    form.parse(req, function(err, fields, files) {

//debug
        console.log("form.bytesReceived");
        console.log("file size: " + JSON.stringify(files.fileUploaded.size));
        console.log("file path: "+JSON.stringify(files.fileUploaded.path));
        console.log("file name: "+JSON.stringify(files.fileUploaded.name));
        console.log("file type: "+JSON.stringify(files.fileUploaded.type));
        console.log("lastModifiedDate: " + JSON.stringify(files.fileUploaded.lastModifiedDate));

//initiera blobanv�ndning
        var blobService = azure.createBlobService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);

//sparar en BLOB som ligger p� disk. callback(err, url) meddelas urlen som bloben fick.
        var saveBLOB = function (filePath, callback) {
            blobService.createBlockBlobFromLocalFile(containerName, filePath, filePath, function (err, result) {
                if (err) return callback(err);
                var imgUrl = blobService.getUrl(containerName, filePath, null, hostName);
                callback(null, { url: imgUrl, name: filePath });
            });
        }

//anv�nder tufu f�r att klippa bilden samt sparar i blob
        var saveBLOBtufu = function (filePath, width, height, callback) {
            var img = tufu(filePath);
            img.cutAndResize(width, height);
            var splittad = filePath.split('.');
            var newFilePath = uploadDir + '/' + uuid() + '.' + splittad[splittad.length - 1];
            img.save(newFilePath, function(err) {
                if (err) return callback(err);
                saveBLOB(newFilePath, function(err, result) {
                    if (err) return callback(err);
                    fs.unlink(newFilePath, function (err) {
                        if (err) return callback(err);
                        callback(null, result);
                    });
                });
            });
        };

//skapa 3 blobar parallellt, sen spara tabell med l�nkar till dessa 3 blobar.
        async.parallel([
            function(callback) {
                saveBLOB(files.fileUploaded.path, function(err, result) {
                    callback(err, result);
                });
            },
            function(callback) {
                saveBLOBtufu(files.fileUploaded.path, 100, 100, function(err, result) {
                    callback(err, result);
                });
            },
            function(callback) {
                saveBLOBtufu(files.fileUploaded.path, 300, 400, function(err, result) {
                    callback(err, result);
                });
            }
        ], function (err, results) {
            if (err) throw err;
            //save table
            console.log('nu ska vi spara i tabell');

            var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
            tableSvc.createTableIfNotExists(tableName, function (err, result, response) {
                if (err) throw err;
                var entGen = azure.TableUtilities.entityGenerator;
                var task = {
                    PartitionKey: entGen.String(partitionKey),//obligatorisk
                    RowKey: entGen.String(uuid()),//obligatorisk
                    description: entGen.String('h�r �r nya beskrivningen'),
                    imgURL: entGen.String(results[0].url),
                    imgName: entGen.String(results[0].name),
                    thumbURL: entGen.String(results[1].url),
                    thumbName: entGen.String(results[1].name),
                    mediumURL: entGen.String(results[2].url),
                    mediumName: entGen.String(results[2].name),
                };

                tableSvc.insertEntity(tableName, task, function (err, result, response) {
                    if (err) throw err;
                    //delete original file
                    fs.unlink(files.fileUploaded.path, function (err) {
                        if (err) throw err;
                        //redirecta anropet till listan.
                        console.log('fil raderad ' + files.fileUploaded.path + ", returnera nu");
                        var fullUrl = req.protocol + '://' + req.get('host');
                        res.redirect(fullUrl + "/list.html");
                    });
                });
            });
        });//async.parallel
    });//form.parse
});//app.post('/upload'

app.get('/sas', function (req, res) {
	var startDate = new Date();
	var expiryDate = new Date(startDate);//Code klagar, testa att skriva om denna rad efter test att det fungerar som det är
	expiryDate.setMinutes(startDate.getMinutes() + 1000000);//obs! öka gärna en nolla här!
	startDate.setMinutes(startDate.getMinutes() - 100);

	var sharedAccessPolicy = {
		AccessPolicy: {
			Permissions: azure.TableUtilities.SharedAccessPermissions.QUERY,
			Start: startDate,
			Expiry: expiryDate
		},
	};
	var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
	var tableSAS = tableSvc.generateSharedAccessSignature(tableName, sharedAccessPolicy);
	var html = "<b>SAS</b>" + tableSAS + "<br>" + "<b>host</b><br>" + JSON.stringify(tableSvc.host) + "<br>";
	res.send(html);
	//https://portalvhdsgfh152bhy290k.table.core.windows.net/photos?st=2015-03-28T20%3A41%3A10Z&se=2015-03-29T00%3A01%3A10Z&sp=r&sv=2014-02-14&tn=photos&sig=yf8MoYRO8kAO4NF89krvZDLjLycVgOBHA%2FC%2FCIc0vV0%3D
});

//app.listen(process.env.PORT || 1337);
app.listen(8080);
