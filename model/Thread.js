/*
| -------------------------------------------------------------------
|  Thread Parser
| -------------------------------------------------------------------
|
|
|	Author : PLIQUE Guillaume
|	Organization : Medialab - Sciences-Po
|	Version : 1.0
*/

// Dependancies
//=============
var fs = require('fs');
var fetcher = require('../tools/Fetcher');
var cheerio = require('cheerio');
var config = require('../tools/ConfigLoader');
var Post = require('./Post');
var log = require('../tools/Logger');
var timer = require('../tools/Timer');

// Main Class
//===========
function Thread(task, callback){


	// Object Configuration
	//---------------------

	var self = this;
	var $ = false;
	this.by_author_string = /par : |da: |by:/;

	var url = task.url;
	var index = task.index;

	// Creating the keyword regex
	var relevance_check_string = config.keywords.map(function(item){return '\\b'+item+'\\b'}).join('|');
	this.relevance_check = new RegExp(relevance_check_string, 'i');

	// Paths
	this.pagination_path = 'table.aff_navHigh';
	this.post_path = 'table.aff_topicList';
	this.date_path = 'span.aff_date > script';
	this.author_path = 'span.aff_author';
	this.generic_post_path = '.aff_blocRepNiv1:not(.aff_blocRepAd), .aff_blocRepNiv2:not(.aff_blocRepAd), .aff_blocRepNiv3:not(.aff_blocRepAd)';
	this.post_content_path = 'p.aff_contenu';

	// Properties
	this.base_url = url.replace(/.html>.*/, '.html'); // Cleaning some wrongly encrypted url
	this.hasPagination = false;
	this.nextPage = this.base_url;
	this.isLastPage = false;
	this.isRelevant = false;
	this.current_salt = false;
	this.posts = [];


	// Base Loop
	//------------
	this.loop_through_thread = function(url, isFirstPage){

		// Debug
		console.log('    debug :: '.blue+'getting '+url);
		
		fetcher.get(url, function(data, code){

			// Code 400
			if(code == 400){
				console.log('Error :: Code 400 -- Connection or Server Error'.red);
				timer.msleepSync(7);
				self.loop_through_thread(self.nextPage, isFirstPage);
			}

			// No data
			if(data === false){
				self.kill('No Data, Code ('+code+')');
				return false;
			}

			// Loading Cheerio
			$ = cheerio.load(data);

			// Checking if we are kicked
			if($('div.captcha').length > 0){
				console.log('Error :: Aufeminin\'s limit reached.'.red);
				
				// Waiting
				console.log('Waiting 7 minutes before starting again.'.blue);
				timer.msleepSync(7);
				self.loop_through_thread(self.nextPage, isFirstPage);
				return false;
			}

			// Wrong pages
			if(data.search(/aff2_signature/) == -1){

				// Message
				console.log(('Post ('+self.base_url+') does not exist any more. Moving on...').red);
				self.kill('Inexistant redirected post');
				return false;
			}

			// Checking the existence of a pagination
			self.checkPagination();

			// Getting current date salt
			self.current_salt = data.match(/aff_FormatDate.sd=([^;]+);/)[1];

			// Getting posts information
			if(isFirstPage){
				self.getMainPost();
			}
			self.getPosts();

			// If thread has only one page
			if(self.isLastPage){

				if(self.isRelevant){
					self.output();
				}
				else{
					callback(index);
					delete self;
				}
				return false;
			}

			// Going throught pagination
			self.loop_through_thread(self.nextPage, false);

		});
	}


	// Utilities
	//------------

	// Initializing loop
	this.loop_through_thread(self.base_url, true);

	// Killing process
	this.kill = function(reason){

		// Keeping file for checking
		log.write('Reason : '+reason+' --'+this.base_url, 'error');
		callback(index);
		delete self;
		return false;
	}

	// Searching for pagination
	this.checkPagination = function(){

		// Getting main nav
		var $nav = $(self.pagination_path).find("table");
		
		if($nav.length > 0){
			self.hasPagination = true;

			// Getting the next page
			var next_page_link = $nav.find('b').next('a').attr("href");
			if(next_page_link !== undefined){
				self.nextPage = next_page_link;
			}
			else{
				self.nextPage = false;
				self.isLastPage = true;
			}
		}
		else{
			self.isLastPage = true;
		}
	}

	// Checking thread relevance
	this.checkRelevance = function(text){

		// Preventing the execution of unnecessary regexps.
		if(this.isRelevant){return false;}

		// Searching for keywords
		if(text.search(this.relevance_check) > -1){
			this.isRelevant = true;
		}
	}

	// Getting basic post information
	this.getMainPost = function(){

		// Hydratation of Post
		var MainPost = new Post({
			title : $(self.post_path).find('h1').eq(0).text()
			,author : $(self.author_path).eq(0).text()
			,date : $(self.date_path).eq(0).html().match(/aff_FormatDate\(([^,]+),/)[1]
			,text : $(self.post_content_path).eq(0).html()
			,date_salt : self.current_salt
		});

		// Checking relevance
		self.checkRelevance(MainPost.text);

		self.posts.push(MainPost);
	}

	// Getting standard posts
	this.getPosts = function(){
		$(self.generic_post_path).each(function(){

			// Hydratation of Post
			var GenericPost = new Post({
				title : $(this).find('h2').eq(0).text()
				,author : $(this).find(self.author_path).eq(0).text().replace(self.by_author_string, '')
				,date : $(this).find(self.date_path).eq(0).html().match(/aff_FormatDate\(([^,]+),/)[1]
				,text : $(this).find(self.post_content_path).eq(0).html()
				,date_salt : self.current_salt
			});

			// Checking relevance
			self.checkRelevance(GenericPost.text);

			self.posts.push(GenericPost);
		});
	}

	// Outputting
	this.output = function(){

		// Announcing
		console.log('Outputting relevant thread :: '.green+self.base_url);

		// Formatting
		var thread_output = {
			'url' : this.base_url,
			'title' : this.posts[0].title,
			'author' : this.posts[0].author,
			'date' : this.posts[0].date,
			'posts' : this.posts
		}

		// If we output to file or mongo
		if(config.format == 'json'){
			this.output_to_json(thread_output, function(){

				// Triggering callback
				callback(index);

				// Releasing memory
				delete self;
			});
		}
		else if(config.format == 'mongo'){
			this.output_to_mongo(thread_output, function(){

				// Triggering callback
				callback(index);

				// Releasing memory
				delete self;
			});
		}

	}

	// Outputting to file
	this.output_to_json = function(thread_output, callback){

		var filename = config.output+'/'+escape(thread_output.title)+'_'+thread_output.date+'_'+thread_output.author;

		// Writing
		fs.writeFile(filename, JSON.stringify(thread_output), function(err){
			if(err){
				console.log(('Error outputting '+self.base_url+' thread.').red);
			}

			callback();
		});	
	}

	// Outputting to mongo
	this.output_to_mongo = function(thread_output, callback){
		
		// To database
		var db_thread = new config.model({data : thread_output});
		db_thread.save(function(err){
			if(err){
				console.log(('Error inserting '+self.base_url+' thread in mongo database.').red);
			}

			callback();	
		});	
	}
}


// Exporting
//------------
module.exports = Thread;

