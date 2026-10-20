# `make -C ops check` — shellcheck, promtool, then the hermetic script tests.
# shellcheck is always the pinned docker image: a runner's preinstalled version
# and a developer's disagree (SC2317 vs SC2329) and a gate must not depend on either.
SHELLCHECK := docker run --rm -v "$(CURDIR)":/mnt -w /mnt koalaman/shellcheck:v0.11.0

# promtool from the image prod runs (docker-compose.yml): rule syntax and the alert unit tests.
PROMTOOL := docker run --rm --entrypoint promtool -v "$(CURDIR)/prometheus":/p -w /p prom/prometheus:v3.15.0

.PHONY: check
check:
	$(SHELLCHECK) -x deploy/*.sh backup/*.sh
	bash deploy/deploy_test.sh
	bash backup/dump_test.sh
	$(PROMTOOL) check rules rules.yml
	$(PROMTOOL) test rules rules_test.yml
