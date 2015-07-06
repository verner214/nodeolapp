/* node server.js
  webbserver som till�ter uppladdning av filer till azure storage för olapp
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
app.post('/edit', function (req, res, next) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if (err) throw err;

        var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);

        var entGen = azure.TableUtilities.entityGenerator;

        console.log(fields.textarea123);
        var task = {
            PartitionKey: entGen.String(fields.partitionkey),//obligatorisk, NYTT:kan vi sätta till variabeln partitionKey egentligen
            RowKey: entGen.String(fields.rowkey),//obligatorisk
            beerName: entGen.String(fields.beerName),
            beerStyle: entGen.String(fields.beerStyle),
            textarea: entGen.String(fields.textarea123),
//            hidden: entGen.Boolean(fields.hidden),/*anv�nder string bara f�r att det inte ska krocka med att den var string f�rr*/
            visible: entGen.String(fields.visible ? 'true' : 'false'),
            sortorder: entGen.String(fields.sortorder),
        };
        tableSvc.mergeEntity(tableName, task, function (error, result, response) {
            if (err) throw err;
            //efter post, visa list.html        
            var fullUrl = req.protocol + '://' + req.get('host');
            res.redirect(fullUrl + "/list.html");//obs! NYTT,detta är vi inte intresserade av när appen anropar
        });
    });    
});//slut update

app.post('/new', function (req, res, next) {
    var form = new formidable.IncomingForm();
    form.uploadDir = uploadDir;       //set upload directory, Formidable uploads to operating systems tmp dir by default
    form.keepExtensions = true;     //keep file extension

    form.parse(req, function(err, fields, files) {

//debug
        console.log("form.bytesReceived");
        console.log("file size img: " + JSON.stringify(files.img.size));
        console.log("file path: "+JSON.stringify(files.img.path));
        console.log("file name: "+JSON.stringify(files.img.name));
        console.log("file type: "+JSON.stringify(files.img.type));
        console.log("lastModifiedDate: " + JSON.stringify(files.img.lastModifiedDate));
        console.log("file size thumb: " + JSON.stringify(files.thumb.size));
        console.log("file path: "+JSON.stringify(files.thumb.path));
        console.log("file name: "+JSON.stringify(files.thumb.name));
        console.log("file type: "+JSON.stringify(files.thumb.type));
        console.log("lastModifiedDate: " + JSON.stringify(files.thumb.lastModifiedDate));

//initiera blobanv�ndning
        var blobService = azure.createBlobService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);

//sparar en BLOB som ligger p� disk. callback(err, url) meddelas urlen som bloben fick.
        var saveBLOB = function (filePath, callback) {
            blobService.createBlockBlobFromLocalFile(containerName, filePath, filePath, function (err, result) {
                if (err) return callback(err);
                console.log('fil SPARAD till BLOB, fil=' + filePath);
                var imgUrl = blobService.getUrl(containerName, filePath, null, hostName);
                callback(null, { url: imgUrl, name: filePath });
            });
        }

//raderar uppladdad fil så att den inte ligger där och skräpar
        var deleteFile = function(filepath) {
            fs.unlink(filepath, function (err) {
                if (err) throw err;
                console.log('fil RADERAD efter sparad till BLOB, fil=' + filepath);
            });
        }         

//skapa 2 blobar parallellt, sen spara tabell med l�nkar till dessa 2 blobar.
        async.parallel([
            function(callback) {
                saveBLOB(files.img.path, function(err, result) {
                    deleteFile(files.img.path);
                    callback(err, result);
                });
            },
            function(callback) {
                saveBLOB(files.thumb.path, function(err, result) {
                    deleteFile(files.thumb.path);
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
                    beerName: entGen.String(fields.beerName),
                    beerStyle: entGen.String(fields.beerStyle),
                    imgURL: entGen.String(results[0].url),
                    imgName: entGen.String(results[0].name),//var används detta egentligen?
                    thumbURL: entGen.String(results[1].url),
                    thumbName: entGen.String(results[1].name),//var används detta egentligen? för debug kan vara bra.
                    visible: entGen.String('true'),
                };

                tableSvc.insertEntity(tableName, task, function (err, result, response) {
                    if (err) throw err;
                    console.log("tabellrad sparad, returnera nu");
                    //var fullUrl = req.protocol + '://' + req.get('host');
                    //res.redirect(fullUrl + "/list.html");
                    res.send('OK');
                });
            });
        });//async.parallel
    });//form.parse
});//app.post('/upload'

app.get('/sas', function (req, res) {
	var startDate = new Date();
	var expiryDate = new Date();//Code klagar, NYTT:testa att skriva om denna rad efter test att det fungerar som det är
	expiryDate.setMinutes(startDate.getMinutes() + 10000000);//obs! öka gärna en nolla här!
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

app.listen(process.env.PORT || 1337);
//app.listen(8080);
