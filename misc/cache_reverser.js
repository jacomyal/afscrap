var c = require('../tools/ConfigLoader');
c.load('file', '../forum_lists/it_procreazione_assistita_reduced.json');

c.file.threads.forEach(function(item, index){
	if(item.url == 'http://forum.alfemminile.com/forum/f110/__f105387_f110-Fivet-a-settembre.html'){
		console.log(index);
	}
});

// http://forum.alfemminile.com/forum/mariage1/__f499455_mariage1-Mi-fate-un-regalo-anche-se-odio-il-natale-star-mi-postate-delle-ricette.html