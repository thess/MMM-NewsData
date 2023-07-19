// Imports
var NodeHelper = require('node_helper')

const fetch = require('node-fetch')
const luxon = require('luxon')
const DateTime = luxon.DateTime;

const URL = 'https://newsdata.io/api/1/news';

// Any declarations

module.exports = NodeHelper.create({
    // Start function
    start: function() {
        console.log('Starting node_helper for module: ' + this.name)

        // Declare any defaults
        this.config = null
        this._localZone = ''
        this._nextPage = ''
        this._numItems = 0
    },

    formatResults: function(news) {
        let articles = []
        news.results.forEach(item => {
            // Datetime of articles seem to be UTC
            let pubDateTime = DateTime.fromSQL(item.pubDate, opts = {zone: 'UTC'});
            let articleTime = pubDateTime.toLocaleString(DateTime.DATETIME_SHORT);
            if (this.config.hasOwnProperty('timeFormat')) {
                if (this.config.timeFormat === "relative") {
                    articleTime = pubDateTime.toRelative();
                } else if (this.config.timeFormat === "local") {
                    articleTime = pubDateTime.setZone(this._localzone).toLocaleString(DateTime.DATETIME_SHORT);
                }
            }
            item.publishedAt = articleTime
            item.sourceID = item.source_id
            item.sourceName = item.source_id
            if (item.creator) {
                item.author = item.creator[0]
            } else { item.author = "Unknown" }
            item.imageURL = item.image_url
            // Get some article text if any
            if(!item.content) item.content = item.description
            if(!item.description) {
                if(!item.content) {
                    item.description = "Article description empty."
                } else {
                    item.description = item.content
                }
            }
            // Truncate gracefully if possible
            if(item.description.length > 400) {
                item.description = item.description.substring(0, 400) + " ..."
            }
            const ellipsis = item.description.indexOf("[…]")
            if(ellipsis > 0) {
                item.description = item.description.substring(0, ellipsis + 3)
            }
            articles.push(item)
        })
        return articles
    },

    getNews: async function(queryParam) {
        let queryList = queryParam.toString().replace(/%2C/g, ',');
        let url = `${URL}?apiKey=${this.config.apiKey}&${queryList}`;
        if (this.config.debug) console.log("Query: " + url);
        const response = await fetch(url);
        if (response.status !== 200) {
            console.error(`Error in getNews: ${response.status} ${response.statusText}`)
            throw response.statusCode
        }
        return await response.json();
    },

    fetchNews: function(payload, newBatch) {
        let q = this.config.query
        let qs = new URLSearchParams()

        for (const [key, val] of Object.entries(q)) {
            if (val !== "") qs.append(key, val.replace(/\s/g, ""))
        }
        if (this._nextPage !== "") {
            qs.append('page', this._nextPage)
        }
        this.getNews(qs).then(news => {
            this._numItems += news.results.length
            if (payload.debug) {
                console.log("Num items = ", this._numItems, " out of " + news.totalResults +
                    " (" + news.status + ")");
            }
            let articles = this.formatResults(news)
            //if (payload.debug) console.log("Sending articles: ", JSON.stringify(articles))
            this.sendSocketNotification((newBatch) ? "NEWSDATA_UPDATE" : "NEWSDATA_APPEND", articles)
            if (!newBatch) {
                this._nextPage = ""
                this._numItems = 0
            } else {
                this._nextPage = news.nextPage
            }
        }).catch(err => {
            console.log("Error: ", err);
        });
    },

    // Socket Notification Received
    socketNotificationReceived: function(notification, payload) {
        if (notification === "START") {
            this.config = payload
            this._localzone = DateTime.local().toFormat('z');
            if (this.config.hasOwnProperty('timeZone') && this.config.timeZone !== "") {
                // Use override
                this._localzone = this.config.timeZone;
            }
            console.log("[NEWSDATA] initialized")
        } else if (notification === "UPDATE") {
            if (this.config.debug) console.log("UPDATE request");
            this.fetchNews(payload, true)
        } else if (notification === "APPEND") {
            if (this.config.debug) console.log("APPEND request");
            this.fetchNews(payload, false)
        }
    },
})
