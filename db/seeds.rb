# This file should contain all the record creation needed to seed the database with most of the
# data from the original consolegrid site.
# The data can then be loaded with the rake db:seed (or created alongside the db with db:setup).
#
# Note: Original seed file renamed seeds_bak.rb just in case it's desired to start without images clean site for 

require 'json'


# Get the original site data 
data_filename = 'console_data.json'
data_path = Rails.root.join('consolegrid_scraper', data_filename)
data_file = File.read(data_path)

console_data_array =  JSON.parse(data_file)

# Use a dummy user to set as creator of seed pictures
dummy_user = User.create({
  :email => 'dummy@dummy.com',
  :password => 'password',
 })

console_data_array.each_with_index do |console_data, console_index|
  Console.transaction do
    console = Console.create({
      :name => console_data["consolename"],
      :shortname => console_data["abbreviation"]
    })
    printf("processing console %i of %i: %s", console_index + 1, console_data_array.length, console_data["consolename"])
    games = console_data["gameData"]
    printf("Found %i games\n", games.length)
    
    games.each_with_index do |game, index|
      printf("(%i of %i): processing game %s\n", index + 1, games.length, game["name"])
      console_game = Game.new(:name => game["name"])
      console_game.console = console

      game["imageLinks"].each do |image_link|
        printf("\tadding %i images\n", game["imageLinks"].length)
        picture = Picture.new(:image_url => image_link["source"])
        picture.game = console_game
        picture.user = dummy_user
        picture.save
      end
      console_game.save    
    end
  end
end

puts "Indexing with Solr"
Game.reindex

