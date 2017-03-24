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
//var tableName = "tblolapp";
var tblOlapp = "tblolapp";
var tblDemo = "tblolappdemo";
//var tableNameDemo = "tblolappdemo";
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

var uploadDir = "upload";

//statiska html-filer ligger i public/
app.use(express.static(path.join(__dirname, 'public')));
console.log("public=" + path.join(__dirname, 'public'));

//sparar images om det finns
var saveImages = function(files, callback) {
    if (files.img === null || files.img === undefined) {
        return callback(null, null);
    }
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
        console.log('blobar sparade.');
        callback({url : results[0].url, name : results[0].name}, {url : results[1].url, name : results[1].name});
    });//parallell
}//saveImages

//gör både new och edit
app.post('/newedit', function (req, res, next) {
    console.log("newedit, enter");
    var form = new formidable.IncomingForm();
    console.log("newedit, enter2");
    form.uploadDir = uploadDir;       //set upload directory, Formidable uploads to operating systems tmp dir by default
    console.log("newedit, enter3");
    form.keepExtensions = true;     //keep file extension

    form.parse(req, function(err, fields, files) {
        var tableName = (fields.demo === undefined || fields.demo.localeCompare("false") === 0) ? tblOlapp : tblDemo;

//debug
        console.log("newedit, id = "  + fields.id);
        
        var bNew = fields.id === null || fields.id === undefined || fields.id === ""; 
        var rowId = bNew ? String(uuid()) : fields.id;

//nytt: spara ev. bilder till blob, hantera skapade urler
        saveImages(files, function(img, thumb) {
            var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
            tableSvc.createTableIfNotExists(tableName, function (err, result, response) {
                if (err) throw err;
                var entGen = azure.TableUtilities.entityGenerator;
                var task = {
                    PartitionKey: entGen.String(partitionKey),//obligatorisk
                    RowKey: entGen.String(rowId),//obligatorisk
                    beerName: entGen.String(fields.beerName),
                    beerStyle: entGen.String(fields.beerStyle),
                    og: entGen.String(fields.og),
                    fg: entGen.String(fields.fg),
                    description: entGen.String(fields.description),
                    recipe: entGen.String(fields.recipe),
                    comments: entGen.String(fields.comments),
                    brewingDate: entGen.String(fields.brewingDate),
                    people: entGen.String(fields.people),
                    place: entGen.String(fields.place),
                    hide: entGen.String(fields.hide),
                    visible: entGen.String('true')//används?
                };
                if (img !== null) {
                    task.imgURL = entGen.String(img.url);
                    task.imgName = entGen.String(img.name);
                    task.thumbURL = entGen.String(thumb.url);
                    task.thumbName = entGen.String(thumb.name);
                }
                if (bNew) {
                    tableSvc.insertEntity(tableName, task, function (err, result, response) {
                        if (err) throw err;
                        console.log("insert");
                        //var fullUrl = req.protocol + '://' + req.get('host');
                        //res.redirect(fullUrl + "/list.html");
                        res.send('OK');
                    });
                } else {
                    tableSvc.mergeEntity(tableName, task, function (err, result, response) {
                        if (err) throw err;
                        console.log("update");
                        //efter post, visa list.html        
                        //var fullUrl = req.protocol + '://' + req.get('host');
                        //res.redirect(fullUrl + "/list.html");//obs! NYTT,detta är vi inte intresserade av när appen anropar
                        res.send('OK');
                    });
                }//else
            });//tableSvc.createTableIfNotExists
        });//saveImages
    });//form.parse
});//app.post('/newedit'

//gallerynew, param: id (rowid), thumb, img, text (optional) 
app.post('/gallerynew', function (req, res, next) {
    var form = new formidable.IncomingForm();
    form.uploadDir = uploadDir;       //set upload directory, Formidable uploads to operating systems tmp dir by default
    form.keepExtensions = true;     //keep file extension

    form.parse(req, function(err, fields, files) {
        var tableName = (fields.demo === undefined || fields.demo.localeCompare("false") === 0) ? tblOlapp : tblDemo;
        
        if (err) throw err;
        console.log("gallerynew, id = "  + fields.id);
        
//nytt: spara ev. bilder till blob, hantera skapade urler
        saveImages(files, function(img, thumb) {
            var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
            tableSvc.retrieveEntity(tableName, partitionKey, fields.id, function(err, result, response) {
                if (err) throw err;
                var galleryArr = [];
                if (result["gallery"] !== undefined) {
                    galleryArr = JSON.parse(result["gallery"]["_"]);
                }
                var galleryItem = {imgURL: img.url, thumbURL: thumb.url, text: fields.text, hide: false};
                galleryArr.push(galleryItem);
                
//merga med existing row                
                var entGen = azure.TableUtilities.entityGenerator;
                var task = {
                    PartitionKey: entGen.String(partitionKey),
                    RowKey: entGen.String(fields.id),
                    gallery: entGen.String(JSON.stringify(galleryArr))
                };                
                tableSvc.mergeEntity(tableName, task, function (err, result, response) {
                    if (err) throw err;
                    console.log("mergeEntity");
                    res.send('OK');
                });
            });//tableSvc.retrieveEntity
        });//saveImages
    });//form.parse
});//app.post('/gallerynew'

//galleryedit, param: id (rowid), imgURL (för identifiering), text (optional), hide (optional) 
app.post('/galleryedit', function (req, res, next) {
    var form = new formidable.IncomingForm();
    form.uploadDir = uploadDir;       //set upload directory, Formidable uploads to operating systems tmp dir by default
    form.keepExtensions = true;     //keep file extension

    form.parse(req, function(err, fields, files) {
        var tableName = (fields.demo === undefined || fields.demo.localeCompare("false") === 0) ? tblOlapp : tblDemo;
        
        if (err) throw err;
        console.log("galleryedit, id = "  + fields.id);
        
//hämta brygd
        var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
        tableSvc.retrieveEntity(tableName, partitionKey, fields.id, function(err, result, response) {
            if (err) throw err;
            var galleryArr = JSON.parse(result["gallery"]["_"]);
            //var galleryItem = {imgURL: img.url, thumbURL: thumb.url, text: fields.text, hide: false};
            for (var n = 0; n < galleryArr.length; n++) {
                if (fields.imgURL == galleryArr[n].imgURL) {
                    galleryArr[n].hide = (fields.hide == "true" || fields.hide == "on") ? "true" : "false";
                    galleryArr[n].text = fields.text;
                }
            }
                
//merga med existing row                
            var entGen = azure.TableUtilities.entityGenerator;
            var task = {
                PartitionKey: entGen.String(partitionKey),
                RowKey: entGen.String(fields.id),
                gallery: entGen.String(JSON.stringify(galleryArr))
            };                
            tableSvc.mergeEntity(tableName, task, function (err, result, response) {
                if (err) throw err;
                console.log("mergeEntity");
                res.send('OK');
            });
        });//tableSvc.retrieveEntity
    });//form.parse
});//app.post('/gallerynew'

//för att kopiera enstaka rad till demotabellen (azure-explorer kan ta bort rader men inte kopiera)
app.post('/copy2demo', function (req, res, next) {
    console.log("copy2demo, enter");
    var form = new formidable.IncomingForm();

    form.parse(req, function(err, fields, files) {
        var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
        tableSvc.retrieveEntity(tblOlapp, partitionKey, fields.id, function(err, result, response) {
            if (err) throw err;
            tableSvc.insertEntity(tblDemo, result, function (err, result2, response) {
                if (err) throw err;
                console.log("insert till demo gjord");
                res.send('OK');
            });
        });//tableSvc.retrieveEntity
    });//form.parse
});//copy2demo

//kopiera allt till demo om inte ölnamnet börjar på zzz
//
app.get('/resetDemo', function (req, res) {
    console.log("resetDemo, enter");
    var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
    tableSvc.createTableIfNotExists(tblDemo, function (err, result, response) {
        if (err) throw err;
        tableSvc.queryEntities(tblDemo, new azure.TableQuery(), null, function(err, result, response) {
            if (err) throw err;
            console.log("resetDemo: result, result.entities = " + result + ":" + result.entries.length + ":" + response.body);
            async.each(result.entries, function (entity, callback) {
                tableSvc.deleteEntity(tblDemo, entity, function(err, response) {
                    if (err) throw err;
                    callback();
                });
                }, function (err) {
                    if (err) throw err;
                    tableSvc.queryEntities(tblOlapp, new azure.TableQuery(), null, function(err, result, response) {
                        if (err) throw err;
                        async.each(result.entries, function (entity, callback) {
                            tableSvc.insertEntity(tblDemo, entity, function (err, result, response) {
                                if (err) throw err;
                                callback();
                            });
                            }, function (err) {
                                if (err) throw err;
                                res.send('OK');
                            }
                        );//each
                    });//queryEntities
                }
            );//each
        });//queryEntities
    });
});//resetDemo
    
//log vid fel och appstart
app.post('/lognew', function (req, res, next) {
    console.log("lognew, enter");
    var form = new formidable.IncomingForm();
    var logTableName = "lawalogtable";
    console.log("lognew, enter2");

    form.parse(req, function(err, fields, files) {
        var tableSvc = azure.createTableService(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY);
        tableSvc.createTableIfNotExists(logTableName, function (err, result, response) {
            var entGen = azure.TableUtilities.entityGenerator;
            var task = {
                PartitionKey: entGen.String(partitionKey),//obligatorisk
                RowKey: entGen.String(uuid()),//obligatorisk
                device: entGen.String(fields.device),
                error: entGen.String(fields.error)
            };
            tableSvc.insertEntity(logTableName, task, function (err, result, response) {
                if (err) throw err;
                console.log("insert");
                res.send('OK');
            });
        });//tableSvc.createTableIfNotExists
    });//form.parse
});//lognew

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
	var tableSAS = tableSvc.generateSharedAccessSignature(tblOlapp, sharedAccessPolicy);
	var html = "<b>SAS</b>" + tableSAS + "<br>" + "<b>host</b><br>" + JSON.stringify(tableSvc.host) + "<br>";
	tableSAS = tableSvc.generateSharedAccessSignature(tblDemo, sharedAccessPolicy);
	html += "<b>SAS-demo</b>" + tableSAS + "<br>" + "<b>host</b><br>" + JSON.stringify(tableSvc.host) + "<br>";
	res.send(html);
	//https://portalvhdsgfh152bhy290k.table.core.windows.net/photos?st=2015-03-28T20%3A41%3A10Z&se=2015-03-29T00%3A01%3A10Z&sp=r&sv=2014-02-14&tn=photos&sig=yf8MoYRO8kAO4NF89krvZDLjLycVgOBHA%2FC%2FCIc0vV0%3D
});

app.listen(process.env.PORT || 1337);
//app.listen(8080);
