import { getConfigAddresses, extractWireguardParams, generateRemark, randomUpperCase, getRandomPath, isIPv6, getDomain, base64ToDecimal } from './helpers';
import { getDataset } from '../kv/handlers';
import { isDomain } from '../helpers/helpers';

function buildSingBoxDNS(proxySettings, outboundAddrs, isWarp) {
    const {
        remoteDNS,
        localDNS,
        VLTRFakeDNS,
        VLTRenableIPv6,
        warpFakeDNS,
        warpEnableIPv6,
        bypassIran,
        bypassChina,
        bypassRussia,
        bypassOpenAi,
        blockAds,
        blockPorn,
        customBypassRules,
        customBlockRules
    } = proxySettings;

    let fakeip;
    const dohHost = getDomain(remoteDNS);
    const isFakeDNS = (VLTRFakeDNS && !isWarp) || (warpFakeDNS && isWarp);
    const isIPv6 = (VLTRenableIPv6 && !isWarp) || (warpEnableIPv6 && isWarp);
    const customBypassRulesDomains = customBypassRules.filter(address => isDomain(address));
    const geoRules = [
        { rule: bypassIran, type: 'direct', geosite: "geosite-ir", geoip: "geoip-ir" },
        { rule: bypassChina, type: 'direct', geosite: "geosite-cn", geoip: "geoip-cn" },
        { rule: bypassRussia, type: 'direct', geosite: "geosite-category-ru", geoip: "geoip-ru" },
        { rule: true, type: 'block', geosite: "geosite-malware" },
        { rule: true, type: 'block', geosite: "geosite-phishing" },
        { rule: true, type: 'block', geosite: "geosite-cryptominers" },
        { rule: blockAds, type: 'block', geosite: "geosite-category-ads-all" },
        { rule: blockPorn, type: 'block', geosite: "geosite-nsfw" }
    ];

    const servers = [
        {
            address: isWarp ? "1.1.1.1" : remoteDNS,
            address_resolver: dohHost.isHostDomain ? "doh-resolver" : "dns-direct",
            detour: "✅ Selector",
            tag: "dns-remote"
        },
        {
            address: localDNS === 'localhost' ? 'local' : localDNS,
            detour: "direct",
            tag: "dns-direct"
        },
        {
            address: "local",
            tag: "dns-local"
        }
    ];

    dohHost.isHostDomain && !isWarp && servers.push({
        address: 'https://8.8.8.8/dns-query',
        detour: "✅ Selector",
        tag: "doh-resolver"
    });

    bypassOpenAi && servers.push({
        address: "178.22.122.100",
        detour: "direct",
        tag: "dns-openai"
    });

    let outboundRule;
    if (isWarp) {
        outboundRule = {
            outbound: "any",
            server: "dns-direct"
        };
    } else {
        const outboundDomains = outboundAddrs.filter(address => isDomain(address));
        const uniqueDomains = [...new Set(outboundDomains)];
        outboundRule = {
            domain: uniqueDomains,
            server: "dns-direct"
        };
    }

    const rules = [
        outboundRule,
        {
            domain: [
                "raw.githubusercontent.com",
                "time.apple.com"
            ],
            server: "dns-direct"
        },
        {
            clash_mode: "Direct",
            server: "dns-direct"
        },
        {
            clash_mode: "Global",
            server: "dns-remote"
        }
    ];

    let blockRule = {
        disable_cache: true,
        rule_set: [],
        action: "reject"
    };

    geoRules.forEach(({ rule, type, geosite, geoip }) => {
        rule && type === 'direct' && rules.push({
            type: "logical",
            mode: "and",
            rules: [
                { rule_set: geosite },
                { rule_set: geoip }
            ],
            server: "dns-direct"
        });

        rule && type === 'block' && blockRule.rule_set.push(geosite);
    });

    rules.push(blockRule);
    const createRule = (server) => ({
        domain_suffix: [],
        server
    });

    let domainDirectRule, domainBlockRule;
    if (customBypassRulesDomains.length) {
        domainDirectRule = createRule("dns-direct");
        customBypassRulesDomains.forEach(domain => {
            domainDirectRule.domain_suffix.push(domain);
        });

        rules.push(domainDirectRule);
    }

    if (customBlockRules.length) {
        domainBlockRule = createRule("dns-block");
        customBlockRules.forEach(domain => {
            domainBlockRule.domain_suffix.push(domain);
        });

        rules.push(domainBlockRule);
    }

    bypassOpenAi && rules.push({
        rule_set: "geosite-openai",
        server: "dns-openai"
    });

    if (isFakeDNS) {
        servers.push({
            address: "fakeip",
            tag: "dns-fake"
        });

        rules.push({
            disable_cache: true,
            inbound: "tun-in",
            query_type: [
                "A",
                "AAAA"
            ],
            server: "dns-fake"
        });

        fakeip = {
            enabled: true,
            inet4_range: "198.18.0.0/15"
        };

        if (isIPv6) fakeip.inet6_range = "fc00::/18";
    }

    return { servers, rules, fakeip };
}

function buildSingBoxRoutingRules(proxySettings, isWarp) {
    const {
        bypassLAN,
        bypassIran,
        bypassChina,
        bypassRussia,
        bypassOpenAi,
        blockAds,
        blockPorn,
        blockUDP443,
        customBypassRules,
        customBlockRules
    } = proxySettings;

    const defaultRules = [
        {
            action: "sniff"
        },
        {
            action: "hijack-dns",
            mode: "or",
            rules: [
                {
                    inbound: "dns-in"
                },
                {
                    protocol: "dns"
                }
            ],
            type: "logical"
        },
        {
            clash_mode: "Direct",
            outbound: "direct"
        },
        {
            clash_mode: "Global",
            outbound: "✅ Selector"
        }
    ];

    const geoRules = [
        {
            rule: bypassIran,
            type: 'direct',
            ruleSet: {
                geosite: "geosite-ir",
                geoip: "geoip-ir",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-ir.srs",
                geoipURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-ir.srs"
            }
        },
        {
            rule: bypassChina,
            type: 'direct',
            ruleSet: {
                geosite: "geosite-cn",
                geoip: "geoip-cn",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-cn.srs",
                geoipURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-cn.srs"
            }
        },
        {
            rule: bypassRussia,
            type: 'direct',
            ruleSet: {
                geosite: "geosite-category-ru",
                geoip: "geoip-ru",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-category-ru.srs",
                geoipURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-ru.srs"
            }
        },
        {
            rule: bypassOpenAi,
            type: 'direct',
            ruleSet: {
                geosite: "geosite-openai",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-openai.srs"
            }
        },
        {
            rule: true,
            type: 'block',
            ruleSet: {
                geosite: "geosite-malware",
                geoip: "geoip-malware",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-malware.srs",
                geoipURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-malware.srs"
            }
        },
        {
            rule: true,
            type: 'block',
            ruleSet: {
                geosite: "geosite-phishing",
                geoip: "geoip-phishing",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-phishing.srs",
                geoipURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geoip-phishing.srs"
            }
        },
        {
            rule: true,
            type: 'block',
            ruleSet: {
                geosite: "geosite-cryptominers",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-cryptominers.srs",
            }
        },
        {
            rule: blockAds,
            type: 'block',
            ruleSet: {
                geosite: "geosite-category-ads-all",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-category-ads-all.srs",
            }
        },
        {
            rule: blockPorn,
            type: 'block',
            ruleSet: {
                geosite: "geosite-nsfw",
                geositeURL: "https://raw.githubusercontent.com/Chocolate4U/Iran-sing-box-rules/rule-set/geosite-nsfw.srs",
            }
        },
    ];

    const directDomainRules = [], directIPRules = [], blockDomainRules = [], blockIPRules = [], ruleSets = [];
    bypassLAN && directIPRules.push({
        ip_is_private: true,
        outbound: "direct"
    });

    const createRule = (rule, action) => {
        return action === 'direct' ? {
            [rule]: [],
            outbound: action
        } : {
            [rule]: [],
            action
        }
    };

    const routingRuleSet = {
        type: "remote",
        tag: "",
        format: "binary",
        url: "",
        download_detour: "direct"
    };

    const directDomainRule = createRule('rule_set', 'direct');;
    const directIPRule = createRule('rule_set', 'direct');;
    const blockDomainRule = createRule('rule_set', 'reject');
    const blockIPRule = createRule('rule_set', 'reject');

    geoRules.forEach(({ rule, type, ruleSet }) => {
        if (!rule) return;
        const { geosite, geoip, geositeURL, geoipURL } = ruleSet;
        const isDirect = type === 'direct';
        const domainRule = isDirect ? directDomainRule : blockDomainRule;
        const ipRule = isDirect ? directIPRule : blockIPRule;

        domainRule.rule_set.push(geosite);
        ruleSets.push({ ...routingRuleSet, tag: geosite, url: geositeURL });
        if (geoip) {
            ipRule.rule_set.push(geoip);
            ruleSets.push({ ...routingRuleSet, tag: geoip, url: geoipURL });
        }
    });

    const pushRuleIfNotEmpty = (rule, targetArray) => {
        if (rule.rule_set?.length || rule.domain_suffix?.length || rule.ip_cidr?.length) {
            targetArray.push(rule);
        }
    };

    pushRuleIfNotEmpty(directDomainRule, directDomainRules);
    pushRuleIfNotEmpty(directIPRule, directIPRules);
    pushRuleIfNotEmpty(blockDomainRule, blockDomainRules);
    pushRuleIfNotEmpty(blockIPRule, blockIPRules);

    const processRules = (addresses, action) => {
        const domainRule = createRule('domain_suffix', action);
        const ipRule = createRule('ip_cidr', action);
        addresses.forEach(address => {
            if (isDomain(address)) {
                domainRule.domain_suffix.push(address);
            } else {
                const ip = isIPv6(address) ? address.replace(/\[|\]/g, '') : address;
                ipRule.ip_cidr.push(ip);
            }
        });

        pushRuleIfNotEmpty(domainRule, action === 'direct' ? directDomainRules : blockDomainRules);
        pushRuleIfNotEmpty(ipRule, action === 'direct' ? directIPRules : blockIPRules);
    };

    customBypassRules.length && processRules(customBypassRules, 'direct');
    customBlockRules.length && processRules(customBlockRules, 'reject');
    let rules = [];

    isWarp && blockUDP443 && rules.push({
        network: "udp",
        port: 443,
        protocol: "quic",
        action: "reject"
    });

    !isWarp && rules.push({
        network: "udp",
        action: "reject"
    });

    rules = [...defaultRules, ...rules, ...blockDomainRules, ...blockIPRules, ...directDomainRules, ...directIPRules];
    return { rules, rule_set: ruleSets };
}

function buildSingBoxVLOutbound(proxySettings, remark, address, port, host, sni, allowInsecure) {
    const { userID, defaultHttpsPorts } = globalThis;
    const { VLTRenableIPv6, proxyIPs } = proxySettings;
    const path = `/${getRandomPath(16)}${proxyIPs.length ? `/${btoa(proxyIPs.join(','))}` : ''}`;
    const tls = defaultHttpsPorts.includes(port) ? true : false;
    const outbound = {
        type: "vless",
        server: address,
        server_port: +port,
        uuid: userID,
        packet_encoding: "",
        tls: {
            alpn: "http/1.1",
            enabled: true,
            insecure: allowInsecure,
            server_name: sni,
            utls: {
                enabled: true,
                fingerprint: "randomized"
            }
        },
        transport: {
            early_data_header_name: "Sec-WebSocket-Protocol",
            max_early_data: 2560,
            headers: {
                Host: host
            },
            path: path,
            type: "ws"
        },
        tcp_fast_open: true,
        tcp_multi_path: true,
        tag: remark
    };

    if (isDomain(address)) outbound.domain_strategy = VLTRenableIPv6 ? "prefer_ipv4" : "ipv4_only";
    if (!tls) delete outbound.tls;
    return outbound;
}

function buildSingBoxTROutbound(proxySettings, remark, address, port, host, sni, allowInsecure) {
    const { TRPassword, defaultHttpsPorts } = globalThis;
    const { VLTRenableIPv6, proxyIPs } = proxySettings;
    const path = `/tr${getRandomPath(16)}${proxyIPs.length ? `/${btoa(proxyIPs.join(','))}` : ''}`;
    const tls = defaultHttpsPorts.includes(port) ? true : false;
    const outbound = {
        type: "trojan",
        password: TRPassword,
        server: address,
        server_port: +port,
        tls: {
            alpn: "http/1.1",
            enabled: true,
            insecure: allowInsecure,
            server_name: sni,
            utls: {
                enabled: true,
                fingerprint: "randomized"
            }
        },
        transport: {
            early_data_header_name: "Sec-WebSocket-Protocol",
            max_early_data: 2560,
            headers: {
                Host: host
            },
            path: path,
            type: "ws"
        },
        tcp_fast_open: true,
        tcp_multi_path: true,
        tag: remark
    }

    if (isDomain(address)) outbound.domain_strategy = VLTRenableIPv6 ? "prefer_ipv4" : "ipv4_only";
    if (!tls) delete outbound.tls;
    return outbound;
}

function buildSingBoxWarpOutbound(proxySettings, warpConfigs, remark, endpoint, chain) {
    const ipv6Regex = /\[(.*?)\]/;
    const portRegex = /[^:]*$/;
    const endpointServer = endpoint.includes('[') ? endpoint.match(ipv6Regex)[1] : endpoint.split(':')[0];
    const endpointPort = endpoint.includes('[') ? +endpoint.match(portRegex)[0] : +endpoint.split(':')[1];
    const server = chain ? "162.159.192.1" : endpointServer;
    const port = chain ? 2408 : endpointPort;
    const { warpEnableIPv6 } = proxySettings;

    const {
        warpIPv6,
        reserved,
        publicKey,
        privateKey
    } = extractWireguardParams(warpConfigs, chain);

    const outbound = {
        address: [
            "172.16.0.2/32",
            warpIPv6
        ],
        mtu: 1280,
        peers: [
            {
                address: server,
                port: port,
                public_key: publicKey,
                reserved: base64ToDecimal(reserved),
                allowed_ips: [
                    "0.0.0.0/0",
                    "::/0"
                ],
                persistent_keepalive_interval: 5
            }
        ],
        private_key: privateKey,
        type: "wireguard",
        tag: remark
    };

    if (isDomain(server)) outbound.domain_strategy = warpEnableIPv6 ? "prefer_ipv4" : "ipv4_only";
    if (chain) outbound.detour = chain;
    return outbound;
}

function buildSingBoxChainOutbound(chainProxyParams, VLTRenableIPv6) {
    if (["socks", "http"].includes(chainProxyParams.protocol)) {
        const { protocol, server, port, user, pass } = chainProxyParams;

        const chainOutbound = {
            type: protocol,
            tag: "",
            server: server,
            server_port: +port,
            username: user,
            password: pass,
            detour: ""
        };

        if (isDomain(server)) chainOutbound.domain_strategy = VLTRenableIPv6 ? "prefer_ipv4" : "ipv4_only";
        if (protocol === 'socks') chainOutbound.version = "5";
        return chainOutbound;
    }

    const { server, port, uuid, flow, security, type, sni, fp, alpn, pbk, sid, headerType, host, path, serviceName } = chainProxyParams;
    const chainOutbound = {
        type: "vless",
        tag: "",
        server: server,
        server_port: +port,
        uuid: uuid,
        flow: flow,
        detour: ""
    };

    if (isDomain(server)) chainOutbound.domain_strategy = VLTRenableIPv6 ? "prefer_ipv4" : "ipv4_only";
    if (security === 'tls' || security === 'reality') {
        const tlsAlpns = alpn ? alpn?.split(',').filter(value => value !== 'h2') : [];
        chainOutbound.tls = {
            enabled: true,
            server_name: sni,
            insecure: false,
            alpn: tlsAlpns,
            utls: {
                enabled: true,
                fingerprint: fp
            }
        };

        if (security === 'reality') {
            chainOutbound.tls.reality = {
                enabled: true,
                public_key: pbk,
                short_id: sid
            };

            delete chainOutbound.tls.alpn;
        }
    }

    if (headerType === 'http') {
        const httpHosts = host?.split(',');
        chainOutbound.transport = {
            type: "http",
            host: httpHosts,
            path: path,
            method: "GET",
            headers: {
                "Connection": ["keep-alive"],
                "Content-Type": ["application/octet-stream"]
            },
        };
    }

    if (type === 'ws') {
        const wsPath = path?.split('?ed=')[0];
        const earlyData = +path?.split('?ed=')[1] || 0;
        chainOutbound.transport = {
            type: "ws",
            path: wsPath,
            headers: { Host: host },
            max_early_data: earlyData,
            early_data_header_name: "Sec-WebSocket-Protocol"
        };
    }

    if (type === 'grpc') chainOutbound.transport = {
        type: "grpc",
        service_name: serviceName
    };

    return chainOutbound;
}

export async function getSingBoxWarpConfig(request, env) {
    const { proxySettings, warpConfigs } = await getDataset(request, env);
    const { warpEndpoints } = proxySettings;
    const config = structuredClone(singboxConfigTemp);
    config.endpoints = [];
    const dnsObject = buildSingBoxDNS(proxySettings, undefined, true);
    const { rules, rule_set } = buildSingBoxRoutingRules(proxySettings, true);
    config.dns.servers = dnsObject.servers;
    config.dns.rules = dnsObject.rules;
    if (dnsObject.fakeip) config.dns.fakeip = dnsObject.fakeip;
    config.route.rules = rules;
    config.route.rule_set = rule_set;
    const selector = config.outbounds[0];
    const warpUrlTest = config.outbounds[1];
    selector.outbounds = [`💦 Warp - Best Ping 🚀`, `💦 WoW - Best Ping 🚀`];
    config.outbounds.splice(2, 0, structuredClone(warpUrlTest));
    const WoWUrlTest = config.outbounds[2];
    warpUrlTest.tag = `💦 Warp - Best Ping 🚀`;
    warpUrlTest.interval = `${proxySettings.bestWarpInterval}s`;
    WoWUrlTest.tag = `💦 WoW - Best Ping 🚀`;
    WoWUrlTest.interval = `${proxySettings.bestWarpInterval}s`;
    const warpRemarks = [], WoWRemarks = [];

    warpEndpoints.forEach((endpoint, index) => {
        const warpRemark = `💦 ${index + 1} - Warp 🇮🇷`;
        const WoWRemark = `💦 ${index + 1} - WoW 🌍`;
        const warpOutbound = buildSingBoxWarpOutbound(proxySettings, warpConfigs, warpRemark, endpoint, '');
        const WoWOutbound = buildSingBoxWarpOutbound(proxySettings, warpConfigs, WoWRemark, endpoint, warpRemark);
        config.endpoints.push(WoWOutbound, warpOutbound);
        warpRemarks.push(warpRemark);
        WoWRemarks.push(WoWRemark);
        warpUrlTest.outbounds.push(warpRemark);
        WoWUrlTest.outbounds.push(WoWRemark);
    });

    selector.outbounds.push(...warpRemarks, ...WoWRemarks);
    return new Response(JSON.stringify(config, null, 4), {
        status: 200,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'CDN-Cache-Control': 'no-store'
        }
    });
}

export async function getSingBoxCustomConfig(request, env) {
    const { hostName } = globalThis;
    const { proxySettings } = await getDataset(request, env);
    let chainProxy;
    const {
        cleanIPs,
        ports,
        VLConfigs,
        TRConfigs,
        outProxy,
        outProxyParams,
        customCdnAddrs,
        customCdnHost,
        customCdnSni,
        bestVLTRInterval,
        VLTRenableIPv6
    } = proxySettings;

    if (outProxy) {
        const proxyParams = outProxyParams;
        try {
            chainProxy = buildSingBoxChainOutbound(proxyParams, VLTRenableIPv6);
        } catch (error) {
            console.log('An error occured while parsing chain proxy: ', error);
            chainProxy = undefined;
            await env.kv.put("proxySettings", JSON.stringify({
                ...proxySettings,
                outProxy: '',
                outProxyParams: {}
            }));
        }
    }

    const Addresses = await getConfigAddresses(cleanIPs, VLTRenableIPv6);
    const totalAddresses = [...Addresses, ...customCdnAddrs];
    const config = structuredClone(singboxConfigTemp);
    const dnsObject = buildSingBoxDNS(proxySettings, totalAddresses, false);
    const { rules, rule_set } = buildSingBoxRoutingRules(proxySettings, false);
    config.dns.servers = dnsObject.servers;
    config.dns.rules = dnsObject.rules;
    if (dnsObject.fakeip) config.dns.fakeip = dnsObject.fakeip;
    config.route.rules = rules;
    config.route.rule_set = rule_set;
    const selector = config.outbounds[0];
    const urlTest = config.outbounds[1];
    selector.outbounds = ['💦 Best Ping 💥'];
    urlTest.interval = `${bestVLTRInterval}s`;
    urlTest.tag = '💦 Best Ping 💥';
    let proxyIndex = 1;
    const protocols = [
        ...(VLConfigs ? ["VLESS"] : []),
        ...(TRConfigs ? ["Trojan"] : [])
    ];

    protocols.forEach(protocol => {
        let protocolIndex = 1;
        ports.forEach(port => {
            totalAddresses.forEach(addr => {
                let VLOutbound, TROutbound;
                const isCustomAddr = customCdnAddrs.includes(addr);
                const configType = isCustomAddr ? 'C' : '';
                const sni = isCustomAddr ? customCdnSni : randomUpperCase(hostName);
                const host = isCustomAddr ? customCdnHost : hostName;
                const remark = generateRemark(protocolIndex, port, addr, cleanIPs, protocol, configType);

                if (protocol === "VLESS") {
                    VLOutbound = buildSingBoxVLOutbound(
                        proxySettings,
                        chainProxy ? `proxy-${proxyIndex}` : remark,
                        addr,
                        port,
                        host,
                        sni,
                        isCustomAddr
                    );
                    config.outbounds.push(VLOutbound);
                }

                if (protocol === "Trojan") {
                    TROutbound = buildSingBoxTROutbound(
                        proxySettings,
                        chainProxy ? `proxy-${proxyIndex}` : remark,
                        addr,
                        port,
                        host,
                        sni,
                        isCustomAddr
                    );
                    config.outbounds.push(TROutbound);
                }

                if (chainProxy) {
                    const chain = structuredClone(chainProxy);
                    chain.tag = remark;
                    chain.detour = `proxy-${proxyIndex}`;
                    config.outbounds.push(chain);
                }

                selector.outbounds.push(remark);
                urlTest.outbounds.push(remark);
                proxyIndex++;
                protocolIndex++;
            });
        });
    });

    return new Response(JSON.stringify(config, null, 4), {
        status: 200,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'CDN-Cache-Control': 'no-store'
        }
    });
}

const singboxConfigTemp = {
    log: {
        level: "warn",
        timestamp: true
    },
    dns: {
        servers: [],
        rules: [],
        strategy: "ipv4_only",
        independent_cache: true
    },
    inbounds: [
        {
            type: "direct",
            tag: "dns-in",
            listen: "0.0.0.0",
            listen_port: 6450,
            override_address: "1.1.1.1",
            override_port: 53
        },
        {
            type: "tun",
            tag: "tun-in",
            address: [
                "172.18.0.1/30",
                "fdfe:dcba:9876::1/126"
            ],
            mtu: 9000,
            auto_route: true,
            strict_route: true,
            endpoint_independent_nat: true,
            stack: "mixed"
        },
        {
            type: "mixed",
            tag: "mixed-in",
            listen: "0.0.0.0",
            listen_port: 2080
        }
    ],
    outbounds: [
        {
            type: "selector",
            tag: "✅ Selector",
            outbounds: []
        },
        {
            type: "urltest",
            tag: "",
            outbounds: [],
            url: "https://www.gstatic.com/generate_204",
            interval: ""
        },
        {
            type: "direct",
            domain_strategy: "ipv4_only",
            tag: "direct"
        }
    ],
    route: {
        rules: [],
        rule_set: [],
        auto_detect_interface: true,
        override_android_vpn: true,
        final: "✅ Selector"
    },
    ntp: {
        enabled: true,
        server: "time.apple.com",
        server_port: 123,
        detour: "direct",
        interval: "30m",
        write_to_system: false
    },
    experimental: {
        cache_file: {
            enabled: true,
            store_fakeip: true
        },
        clash_api: {
            external_controller: "127.0.0.1:9090",
            external_ui: "ui",
            external_ui_download_url: "https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip",
            external_ui_download_detour: "direct",
            default_mode: "Rule"
        }
    }
};