const util = require('util');
const _    = require('underscore');
const $ = require('cheerio');
var request = require('request');



var base_url = 'http://www.consolegrid.com';
var menuLinks = [];

makeRequest();


// jquery is ready when this gets called
function makeRequest() {
    request(base_url, processHTML);
}

function processHTML(err, response, gridhtml) {
    console.log('got main page html');
    menuLinks = findMenuLinks(gridhtml);
    console.log('found menu links: ', menuLinks);
    processLinks(menuLinks, function(allConsoleData) {
        console.log('writing console data to file...');
        writeJSON(allConsoleData, 'console_data.json');
        console.log('done!');
    });
}


// Finds all the console links on the main consolegrid page.
function findMenuLinks(gridhtml) {
    $gridhtml = $.load(gridhtml);

    var $links = $gridhtml('.dropdown-menu li a');

    var links = 
        _.filter(
            $links, function(link) {
                return $(link).attr('href')[0] === '/';
            }
        ).map(function(link) {
            return {
                path: $(link).attr('href'),
                text: $(link).text()
            };
        });

    console.log(links);
    return links;
}

// Iterates over all console links in the menu and get all game and associated image data.
function processLinks (menuLinks, callback) {
    var consoleEntries = [];

    var processMenuLinks = function() {
        if (menuLinks.length) {
            console.log('number of consoles remaining: ', menuLinks.length);
            var menuLink = menuLinks.shift();

            var consolePageLink = buildConsolePageLink(menuLink.path);
            

            var consoleInfo = parseConsoleInfoFromLink(menuLink);
            console.log('')
            console.log("Processing data for " + consoleInfo.consolename);
            
            request(consolePageLink, function(err, response, pageHTML) {
                var $page = $.load(pageHTML);
                var $lastPageLink = $page('div.pagination li.next').prev().find('a');
                var linkhref= $lastPageLink.attr('href');
                var regex = /page=(\d+)/;
                var pages = parseInt(linkhref.match(regex)[1]);
                var pageNumbers = [];
                for (var i = 1; i <= pages; i++) {
                    pageNumbers.push(i);
                }
                console.log("found " + pageNumbers.length + " pages of games");
                getConsoleData(menuLink, pageNumbers, function(consoleData) {
                    consoleInfo.gameData = consoleData;
                    consoleEntries.push(consoleInfo);
                    console.log();
                    processMenuLinks();
                });
            });

        }
        else {
            callback(consoleEntries);
        }
    }

    processMenuLinks();
}

var count = 0;
// Gets the game data and images for a console for a particular page.
function getConsoleData(menuLink, pageNumbers, callback) {
    var allGameData = [];
    // var counter = 0;
    var getNextPageData = function() {
        // counter++;
        if (pageNumbers.length > 0) {
            var currentPageNumber = pageNumbers.shift();
            console.log('processing page: ' + currentPageNumber);
            var consoleLink = buildConsolePageLink(menuLink.path, currentPageNumber);
            request(consoleLink, function(err, response, pageHTML) {

                getGameDataFromConsolePage(pageHTML, function(data) {
                    console.log('done, processed data for ' + data.length + 'games');
                    allGameData.push.apply(allGameData, data);
                    getNextPageData();
                });
            });
        }
        else {
            console.log('finished getting game data: found ' + allGameData.length + ' games');
            callback(allGameData);
        }
    };

    getNextPageData();

}

// gets all the games links and data from a particular game page.
function getGameDataFromConsolePage(html, callback) {
    var $gamesListPage = $.load(html);
    var $gameTableCells = $gamesListPage("table.game-table td.game-table-name-cell");

    
    var gameLinks = _.map($gameTableCells, function(cell) {
        var $cell = $(cell);
        var $gamePageLink = $cell.find("a").first();
        return {
            name: $gamePageLink.text(),
            path: $gamePageLink.attr('href')
        };
    }).filter(function(link) {
        return link.name.trim().length > 0
    });
    
    var gameData = processGameLinks(gameLinks, callback);

}

// Iterates over all the specified game links and and gets the image data.
// gameLinks entries are augmented with their corresponding image data.
function processGameLinks(gameLinks, callback) {
    var currentIndex = 0;

    var processNextLink = function() {
        if (currentIndex < gameLinks.length) {
            var gameLink = gameLinks[currentIndex];
            currentIndex++;
            // The callback is processNextLink, which ensures
            // that we we're done with the current gameLink before
            // getting the next one.
            console.log('Getting game data for ' + gameLink.name);
            processGameLink(gameLink, processNextLink);
        }
        else {
            callback(gameLinks);
        }

    }
    processNextLink();

}


// gameLink has the form:
// {
//      name: 'After Burner',
//      path: 'some path'
// }
// This will augment gameLink with image data
// in imageLinks property -- an array
function processGameLink(gameLink, callback) {
    var data = getImageDataForGame(gameLink, function(imageLinks) {
        gameLink.imageLinks = imageLinks;
        console.log('found ' + imageLinks.length + ' images for game');
        callback(gameLink);
    });
}

// Given a link for the images for a particular game
// gets the image data as an array of image data including
// the image src and vote count.
function getImageDataForGame(link, callback) {
    var fullLink = buildConsolePageLink(link.path);
    request(fullLink, function(err, response, html) {
        var images = [];
        var topindex;
        // console.log('image html: ', html);
        var $page = $.load(html);

        var $topPicutreDiv = $page("div.top-picture");
        var $toppictureimg = $topPicutreDiv.find("img").last();
        var topVoteCount = parseInt($topPicutreDiv.find(".vote-count").text() || 0);
        var topImgSrc = $toppictureimg.attr('src');
        var imageLinks = [];
        imageLinks.push({
            source: topImgSrc,
            voteCount: topVoteCount
        });
        

        var $otherImageRows = $page("#all-pictures-table tr");

        _.each($otherImageRows, function(row) {
            var $row = $(row);
            var voteCount = parseInt($row.find("li.vote-count").text() || 0);
            var $imgSrc = $row.find("td > img");
            imageLinks.push({
                source: $imgSrc.attr('src'),
                voteCount: voteCount
            });
        });
        callback(imageLinks);
    });
}

// util function to build a link
function buildConsolePageLink(path, page) {
    var link = base_url + path;
    if (page) {
        link += '?page=' + page;
    }
    return link;
}


// gets the console name and abbreviation
// from entries in the menu links.
function parseConsoleInfoFromLink(menuLink) {
    var text = menuLink.text;
    var regex = /(.*)-(.*)/
    var match = (text).match(regex);
    var name = match[1].trim();
    var abbreviation = match[2].trim();
    return {
        consolename: name,
        abbreviation: abbreviation
    };
}


function writeJSON(obj, filename) {
    var json = JSON.stringify(obj);
    var fs = require('fs');
    fs.writeFileSync(filename, json);
}


