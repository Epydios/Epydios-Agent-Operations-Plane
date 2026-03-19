from setuptools import find_packages, setup


setup(
    name="epydios-client",
    version="0.3.0",
    description="Thin Python client SDK for the Epydios localhost gateway",
    author="Epydios",
    license="Apache-2.0",
    python_requires=">=3.9",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
)
