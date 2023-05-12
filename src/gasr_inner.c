#include <dlfcn.h>
#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

typedef void (*callback_t)(u_int8_t *, int, void *);
struct SodaConfig {
  const char *soda_config;
  int soda_config_size;
  callback_t callback;
  void *callback_handle;
};
typedef void *(*CreateExtendedSodaAsync_t)(struct SodaConfig);
typedef void (*ExtendedSodaStart_t)(void *);
typedef void (*ExtendedAddAudio_t)(void *, u_int8_t *, int);

static u_int32_t read_big_endian_u_int32() {
  u_int8_t buffer[4];
  ssize_t n = read(STDIN_FILENO, buffer, sizeof(buffer));
  if (n != sizeof(buffer)) {
    fprintf(stderr, "error reading from stdin\n");
    exit(1);
  }
  return (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
}
static void write_big_endian_u_int32(u_int32_t value) {
  u_int8_t buffer[4];
  buffer[0] = (value >> 24) & 0xFF;
  buffer[1] = (value >> 16) & 0xFF;
  buffer[2] = (value >> 8) & 0xFF;
  buffer[3] = value & 0xFF;
  ssize_t n = write(STDOUT_FILENO, buffer, sizeof(buffer));
  if (n != sizeof(buffer)) {
    fprintf(stderr, "error writing to stdout\n");
    exit(1);
  }
}

static void result_handler(u_int8_t *response, int rlen, void *instance) {
  write_big_endian_u_int32((u_int32_t)rlen);
  ssize_t n = write(STDOUT_FILENO, response, rlen);
  if (n != rlen) {
    fprintf(stderr, "error writing to stdout\n");
    exit(1);
  }
}

int main() {
  struct SodaConfig config;
  void *handle;
  CreateExtendedSodaAsync_t CreateExtendedSodaAsync;
  ExtendedSodaStart_t ExtendedSodaStart;
  ExtendedAddAudio_t ExtendedAddAudio;
  char binary_path[PATH_MAX];
  ssize_t path_length =
      readlink("/proc/self/exe", binary_path, sizeof(binary_path) - 1);

  if (path_length == -1) {
    fprintf(stderr, "error getting path to self\n");
    exit(EXIT_FAILURE);
  }

  binary_path[path_length] = '\0';

  char *binary_dir = dirname(binary_path);
  char sodalib_path[PATH_MAX];
  snprintf(sodalib_path, sizeof(sodalib_path), "%s/libsoda.so", binary_dir);

  void *sodalib = dlopen(sodalib_path, RTLD_NOW);
  if (!sodalib) {
    fprintf(stderr, "error loading library: %s\n", dlerror());
    exit(1);
  }

  u_int32_t size = read_big_endian_u_int32();
  char *cfg_serialized = malloc(size);
  ssize_t n = read(STDIN_FILENO, cfg_serialized, size);
  if (n != size) {
    fprintf(stderr, "error reading from stdin\n");
    exit(1);
  }

  config.soda_config = cfg_serialized;
  config.soda_config_size = size;
  config.callback = result_handler;
  config.callback_handle = NULL;

  CreateExtendedSodaAsync =
      (CreateExtendedSodaAsync_t)dlsym(sodalib, "CreateExtendedSodaAsync");
  ExtendedSodaStart = (ExtendedSodaStart_t)dlsym(sodalib, "ExtendedSodaStart");
  ExtendedAddAudio = (ExtendedAddAudio_t)dlsym(sodalib, "ExtendedAddAudio");
  handle = CreateExtendedSodaAsync(config);
  ExtendedSodaStart(handle);

  while (1) {
    u_int32_t size = read_big_endian_u_int32();
    u_int8_t *audio = malloc(size);
    ssize_t n = read(STDIN_FILENO, audio, size);
    if (n != size) {
      fprintf(stderr, "error reading from stdin\n");
      exit(1);
    }
    ExtendedAddAudio(handle, audio, size);
    free(audio);
  }
  return 0;
}