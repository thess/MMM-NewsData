Module.register("MMM-NewsData", {
    // Declare default inputs
    defaults: {
        apiKey: "",
        pageSize: 20,
        timeFormat: "relative",
        timeZone: "",
        templateFile: "template.html",
        drawInterval: 1000*30,
        fetchInterval: 1000*60*15,
        debug: false,
        QRCode: false,
        query: {
            country: "us",
            category: "top",
            q: "",
            qInTitle: "",
            domain: "",
            language: "en"
        }
    },

    // Get the Stylesheet
    getStyles: function() {
        return [this.file("MMM-NewsData.css")]
    },

    // Import QR code script file
    getScripts: function() {
        if (this.config.QRCode) {
            return ["https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"];
        } else {
            return []
        }
    },

    // Start process
    start: function() {
        this.firstUpdate = 0
        this.index = 0
        this.timer = null
        this.template = ""
        this.suspended = false;
        this.newsArticles = []
        // if (this.config.debug) Log.log("config: ", JSON.stringify(this.config))
        // Start function call to node_helper
        this.sendSocketNotification("START", this.config)
        this.getInfo()
        // Schedule the next update
        this.scheduleUpdate()
    },

    stop: function () {
        Log.info('Stopping module ' + this.name);
      },

    resume: function () {
        Log.info('Resuming module ' + this.name);
        Log.debug('with config: ' + JSON.stringify(this.config));
        this.suspended = false;
        this.updateDom()
    },

    suspend: function () {
        Log.info('Suspending module ' + this.name);
        this.suspended = true;
    },

    getDom: function() {
        var wrapper = document.createElement("div")
        wrapper.id = "NEWSDATA"
        wrapper.className = 'horizontal'
        var newsContent = document.createElement("div")
        newsContent.id = "NEWS_CONTENT"
        wrapper.appendChild(newsContent)
        wrapper.classList.add("untouchable")
        return wrapper
    },

    notificationReceived: function(msg, payload) {
        switch (msg) {
            case "DOM_OBJECTS_CREATED":
                this.readTemplate()
                break
        }
    },

    // Schedule the next update
    scheduleUpdate: function(delay) {
        if (this.config.debug) Log.log("Fetch Interval: ", this.config.fetchInterval)
        let nextLoad = this.config.fetchInterval
        if (typeof delay !== "undefined"  && delay >= 0) {
            nextLoad = delay
        }
        const self = this
        setInterval(function() {
            //if (this.config.debug) Log.log("getting the next batch of data")
            self.getInfo()
        }, nextLoad)
    },

    // Send Socket Notification and start node_helper
    getInfo: function() {
        this.sendSocketNotification("UPDATE", this.config)
    },

    // Receive Socket Notification
    socketNotificationReceived: function(notification, payload) {
        // if (this.config.debug) Log.log("payload received: ", JSON.stringify(payload))
        if (notification === "NEWSDATA_UPDATE") {
            if (payload.length > 0) {
                this.newsArticles = payload
                if (this.firstUpdate === 0) {
                    this.firstUpdate = 1
                    this.index = 0
                    this.draw()
                }
            } else {
                console.log("Warning: No news items returned")
            }
        }
        else if (notification === "NEWSDATA_APPEND") {
            this.newsArticles = this.newsArticles.concat(payload)
        }
    },

    readTemplate: function() {
        var file = this.config.templateFile
        var url = "modules/MMM-NewsData/" + file
        var xmlHttp = new XMLHttpRequest()
        xmlHttp.onreadystatechange = () => {
            var res = []
            if (xmlHttp.readyState == 4 && xmlHttp.status == 200) this.template = xmlHttp.responseText
            else if (xmlHttp.status !== 200 && xmlHttp.readyState !== 1) {
                console.log("A Problem has been encountered retrieving the Template File", "("+xmlHttp.statusText+")")
            }
        }
        xmlHttp.open("GET", url, true)
        xmlHttp.send()
    },

    draw: function() {
        clearTimeout(this.timer)
        this.timer = null
        const tag = [
            "sourceId",  "content", "description", "author",
            "sourceName", "title", "link", "imageURL", "publishedAt"
        ]
        var article = this.newsArticles[this.index]
        var template = this.template

        for (i in tag) {
            var t = tag[i]
            var tu = "%" + t.toUpperCase() + "%"
            template = template.replace(tu, article[t])
        }

        var imgtag = (article.imageURL) ? `<img class="articleImage" src="` + article.imageURL + `"/>` : ""
        template = template.replace("%ARTICLEIMAGE%", imgtag)
        var category = (article.category) ? article.category : "NEWSDATA"
        template = template.replace("%CLASSNAME%", category)
        var news = document.getElementById("NEWSDATA")
        template = template.replace("%QRCODE_CANVAS%", (this.config.QRCode) ?
                `<canvas id="NEWSDATA_QRCODE"></canvas>` : "" )

        var newsContent = document.getElementById("NEWS_CONTENT")
        news.classList.add("hideArticle")
        news.classList.remove("showArticle")
        for (j in article) news.dataset[j] = article[j]

        setTimeout(() => {
            newsContent.innerHTML = ""
            news.classList.remove("hideArticle")
            news.classList.add("showArticle")
            newsContent.innerHTML = template
            if (this.config.QRCode) {
                var qr = new QRious({
                    element: document.getElementById('NEWSDATA_QRCODE'),
                    value: article.link
                });
            }
        }, 900)
        if (this.newsArticles.length < this.config.pageSize) {
            this.sendSocketNotification("APPEND", this.config)
        }
        this.timer = setTimeout(() => {
            this.index++
            if (this.index >= this.newsArticles.length) this.index = 0
            this.draw()
        }, this.config.drawInterval)
    }

})
