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


