build: bin bin/libsoda.so bin/gasr_inner

bin:
	mkdir -p bin

bin/gasr_inner: src/gasr_inner.c
	clang -O3 src/gasr_inner.c -o bin/gasr_inner -ldl

bin/libsoda.so:
	wget 'https://web.archive.org/web/20230215201757if_/https://www.google.com/dl/release2/chrome_component/cn6y2nvtolyfspm43ltjkrdyj4_1.1.1.2/icnkogojpkfjeajonkmlplionaamopkf_1.1.1.2_linux_ad53gn5wwkbkn2bokvc63kbthuwa.crx3' -qO soda.zip
	unzip -p soda.zip SODAFiles/libsoda.so >bin/libsoda.so || true
	rm soda.zip
	printf '0243e050: ffff ff4c 89e6 e8a5 bbe9 0090 9090 9090  ...L............\n0243e060: 9090 9090 9090 9090 9090 9090 9090 9090  ................\n0243e070: 9090 9090 9090 9090 9090 9090 9090 90f3  ................' | xxd -r - bin/libsoda.so

format:
	clang-format -i src/gasr_inner.c
	black src/gasr_outer.py src/soda_api_pb2.py
	npx prettier -w src/*.js *.json
