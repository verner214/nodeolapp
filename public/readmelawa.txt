edit.html ------------------------------------------------------------
hämtar data (en post) direkt från storage-tabelllen, nycklar är rowkey, partitionkey
ett formulär ifylls med hämtat data. action är /edit
/edit används inte av appen utan bara här. 
2d0? ändra action till /newedit. /edit är ju redundant.

index.html -------------------------------------------------------------
startsida. länkar till alla sidor som är användbara utan kontext.

list.html -------------------------------------------------------------
ajaxanrop görs vid onReady. hela tabellinehållet hämtas. lista med rader med data från tabellen samt en länk till edit.html

new.html ---------------------------------------------------------------
enkel form som skapar en ny rad i listan. action = /new

newedit.html ---------------------------------------------------------------
enkel form som skapar en ny rad i listan
som new fast med extra form-paramter = id. fylls id i så görs update istället. action = /newedit

server.js --------------------------------

###############################################################################
2d0 ---------------------------------------------------------------------------
sluta använda /edit och /new, använd alltid /newedit. men behåll edit.html och new.html
ta bort newedit.html efter att punkten ovan är genomförd.
kommentera bort /edit och /new ifrån server.js
göra det möjligt att visa och ändra flera parametrar (speciellt de som är jobbiga att skriva, recipe och comments) i edit.html
gör en eller tre funktioner för att ta hand om gallery.



2d0 --kankse---------------------------------------------------------------------------
(kanske):komma på ett sätt att använda sajten på virtuell maskin, typ ersätta azure med dummymodul (dependency injection). 


#################################################################################
arkiv --------------------------------------------------------------------------
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
            //var fullUrl = req.protocol + '://' + req.get('host');
            //res.redirect(fullUrl + "/list.html");//obs! NYTT,detta är vi inte intresserade av när appen anropar
            res.send('OK');
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
                    og: entGen.String(fields.og),
                    fg: entGen.String(fields.fg),
                    description: entGen.String(fields.description),
                    recipe: entGen.String(fields.recipe),
                    comments: entGen.String(fields.comments),
                    brewingDate: entGen.String(fields.brewingDate),
                    people: entGen.String(fields.people),
                    place: entGen.String(fields.place),
                    hide: entGen.String(fields.hide),
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
});//app.post('/new'


/*
//l�gg uppladdade filer i speciella mappar, som skapas h�r.


var thumbPrefix = "t_";
var thumbDir = thumbPrefix + uploadDir;
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir);
}
*/
