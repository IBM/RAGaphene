## Contributing In General

Our project welcomes external contributions. If you have an itch, please feel
free to scratch it.

To contribute code or documentation, please submit a [pull request](https://github.com/IBM/RAGaphene/pulls).

A good way to familiarize yourself with the codebase and contribution process is
to look for and tackle low-hanging fruit in the [issue tracker](https://github.com/IBM/RAGaphene/issues).
Before embarking on a more ambitious contribution, please quickly [get in touch](#communication) with us.

**Note: We appreciate your effort, and want to avoid a situation where a contribution
requires extensive rework (by you or by us), sits in backlog for a long time, or
cannot be accepted at all!**

### Proposing new features

If you would like to implement a new feature, please [raise an issue](https://github.com/IBM/RAGaphene/issues)
before sending a pull request so the feature can be discussed. This is to avoid
you wasting your valuable time working on a feature that the project developers
are not interested in accepting into the code base.

### Fixing bugs

If you would like to fix a bug, please [raise an issue](https://github.com/IBM/RAGaphene/issues) before sending a
pull request so it can be tracked.

### Merge approval

The project maintainers use LGTM (Looks Good To Me) in comments on the code
review to indicate acceptance. A change requires LGTMs from two of the
project maintainers.

## Legal

Each source file must include a license header for the Apache
Software License 2.0. Using the SPDX format is the simplest approach.
e.g.

```
/*
Copyright <holder> All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
*/
```

We have tried to make it as easy as possible to make contributions. This
applies to how we handle the legal aspects of contribution. We use the
same approach - the [Developer's Certificate of Origin 1.1 (DCO)](https://github.com/hyperledger/fabric/blob/master/docs/source/DCO1.1.txt) - that the Linux® Kernel [community](https://elinux.org/Developer_Certificate_Of_Origin)
uses to manage code contributions.

We simply ask that when submitting a patch for review, the developer
must include a sign-off statement in the commit message.

Here is an example Signed-off-by line, which indicates that the
submitter accepts the DCO:

```
Signed-off-by: John Doe <john.doe@example.com>
```

You can include this automatically when you commit a change to your
local git repository using the following command:

```
git commit -s
```

## Communication

Please use the [issue tracker](https://github.com/IBM/RAGaphene/issues) to ask
questions, report bugs, and propose features.

## Setup

See the [Quick start](README.md#-quick-start) section of the README for how to
install dependencies and run the application locally. Full technical details are
in [docs/architecture.md](docs/architecture.md).

## Testing

Run the test suite before submitting a change:

```shell
npm test                  # run all tests
npm run test:coverage     # with coverage report
```

The suite runs offline; external services are mocked, so no credentials or
network access are required.

## Coding style guidelines

Code is formatted with Prettier and linted with ESLint and Stylelint. A Husky
pre-commit hook runs the tests and a production build. Before committing, you can
run the checks manually:

```shell
npm run lint
npm run format
```
