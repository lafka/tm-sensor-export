module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-connect');
	grunt.loadNpmTasks('grunt-contrib-watch');

	// Default task.
	grunt.registerTask('default', ['jshint','build']);
	grunt.registerTask('build', ['clean','concat','copy']);
	grunt.registerTask('dev', ['build','connect','watch']);

	grunt.initConfig({
		distdir: 'dist',
		pkg: grunt.file.readJSON('package.json'),
		banner:
			'/*! <%= pkg.title || pkg.name %>-<%= pkg.version %> (<%= grunt.template.today("yyyy-mm-dd") %>)\n' +
			'<%= pkg.homepage ? " * " + pkg.homepage + "\\n" : "" %>' +
			' * Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author %>;\n' +
			' * Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %>\n */\n',
		src: {
			js: ['src/*.js'],
			examples: ['examples/**/*']
		},
		clean: ['<%= distdir %>/*'],
		copy: {
			src: {
				files: [ {dest:    '<%= distdir %>',
				          src:     [
							'index.html',
							'tm.cloud.client.js',
							'app.js',
				          ],
				          expand:  true,
				          flatten: true,
				          cwd:     'src/'} ]
			},
			assets: {
				files: [ {dest: '<%= distdir %>',
				          src : '**',
				          expand: true,
				          cwd: 'src/assets/'}]
			},
		},
		concat:{
			distcss: {
				options: { banner: "<%= banner %>" },
				src: [
				      'src/assets/css/bootstrap.min.css',
				      'node_modules/angular-loading-bar/build/loading-bar.min.css',
				],
				dest:'<%= distdir %>/css/style.css'
			},
			distjs:{
				options: { banner: "<%= banner %>" },
				src: ['vendor/angular/angular.min.js',
				      'vendor/angular/angular-route.min.js',
				      'vendor/angular/angular-resource.min.js',
				      'node_modules/underscore/underscore.js',
				      'node_modules/json3/lib/json3.js',
				      'node_modules/ng-storage/ngStorage.min.js',
				      'node_modules/ng-storage/ngStorage.min.js',
				      'node_modules/angular-loading-bar/build/loading-bar.min.js',
				      'vendor/crypto-js/rollups/*.js',
				      'vendor/crypto-js/components/*.js',
				      'src/jquery.min.js',
				      'src/bootstrap.min.js'
				],
				dest:'<%= distdir %>/vendor.js'
			}
		},
		jshint:{
			files: ['gruntFile.js', '<%= src.js %>'],
			options:{
				curly:   true,
				eqeqeq:  true,
				immed:   true,
				latedef: true,
				newcap:  true,
				noarg:   true,
				sub:     true,
				boss:    true,
				eqnull:  true,
				es5:     true,
				globals: {"angular": false}
			}
		},
		watch:{
			all: {
				files: ['src/*'],
				tasks: ['build']
			},
		},
		connect: {
			server: {
				options: {
					port: 8002,
					base: ".",
					hostname: "0.0.0.0"
				}
			}
		},
	});
};
