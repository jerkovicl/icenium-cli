@if not exist %appdata%\npm\node_modules\jshint call npm install jshint -g

jshint --verbose bin lib test %*
