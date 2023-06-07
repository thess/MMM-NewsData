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
		this.localZone = ''
    },

    formatResults: function(news, payload) {
		let articles = []
		news.results.forEach(item => {
			// Datetime of articles seem to be UTC
			let pubDateTime = DateTime.fromSQL(item.pubDate, opts = {zone: 'UTC'});
			let articleTime = pubDateTime.toLocaleString(DateTime.DATETIME_SHORT);
			if (this.config.hasOwnProperty('timeFormat')) {
				if (this.config.timeFormat === "relative") {
					articleTime = pubDateTime.toRelative();
				} else if (this.config.timeFormat === "local") {
					articleTime = pubDateTime.setZone(this.localZone).toLocaleString(DateTime.DATETIME_SHORT);
				}
			}
			item.publishedAt = articleTime
			item.sourceID = item.source_id
			item.sourceName = item.source_id
			if (item.creator) {
				item.author = item.creator[0]
			} else { item.author = "Unknown" }
			item.imageURL = item.image_url
			if(!item.content) item.content = item.description
			if(!item.description) item.description = item.content
			articles.push(item)
		})
		if (payload.debug) console.log("Sending articles: ", JSON.stringify(articles))
		this.sendSocketNotification("NEWSDATA_UPDATE", articles)
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

	fetchNews: function(payload) {
		let q = this.config.query
		let qs = new URLSearchParams()

		for (const [key, val] of Object.entries(q)) {
			if (val !== "") qs.append(key, val.replace(/\s/g, ""))
		}
		this.getNews(qs).then(news => {
			if (payload.debug) {
				console.log("Num items = ", news.results.length, " out of " + news.totalResults +
							" (" + news.status + ")");
			}
			this.formatResults(news, payload)
			nextPage = news.nextPage;
		}).catch(err => {
			console.log("Error: ", err);
		});
	},

    // Socket Notification Received
    socketNotificationReceived: function(notification, payload) {
        if (notification === "START") {
            this.config = payload
			this.localZone = DateTime.local().toFormat('z');
			if (this.config.hasOwnProperty('timeZone') && this.config.timeZone !== "") {
				// Use override
				this.localZone = this.config.timeZone;
			}
			console.log("[NEWSDATA] initialized")
        } else if (notification === "UPDATE") {
            this.fetchNews(payload)
        }
    },
})
